/* eslint-disable @typescript-eslint/no-explicit-any */
// src/lib/audio/AudioEngine.ts
export type Wave = "sine" | "square" | "sawtooth" | "triangle";

export class AudioEngine {
    ctx?: AudioContext;
    analyser?: AnalyserNode;
    master?: GainNode;

    // Synthesis chain
    private osc?: OscillatorNode;
    private voiceGain?: GainNode; // per-voice amp (ADSR)
    private filter?: BiquadFilterNode;
    private shaper?: WaveShaperNode;

    // Params
    private currentWave: Wave = "sine";
    private currentFreq = 220;
    private currentMaster = 0.5;
    private filterCutoff = 1200;
    private filterQ = 0.8;
    private distAmount = 0; // 0..1
    private adsr = { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.2 };

    // Recording
    private recMode?: "wav" | "mp3" | "webm";
    private scriptProc?: ScriptProcessorNode; // wav capture
    private wavChunks: Float32Array[] = [];
    private mediaDest?: MediaStreamAudioDestinationNode; // for MediaRecorder
    private mediaRecorder?: MediaRecorder;
    private mediaChunks: BlobPart[] = [];

    private ensureContext() {
        if (this.ctx) return;
        if (typeof window === "undefined") throw new Error("No window");

        const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
        this.ctx = new AudioCtx();
        if (!this.ctx) return;

        // Nodes
        this.analyser = this.ctx.createAnalyser();
        this.master = this.ctx.createGain();
        this.voiceGain = this.ctx.createGain();
        this.filter = this.ctx.createBiquadFilter();
        this.shaper = this.ctx.createWaveShaper();

        // Configure
        this.analyser.fftSize = 2048;
        this.master.gain.value = this.currentMaster;
        this.voiceGain.gain.value = 0; // idle until note on (ADSR)
        this.filter.type = "lowpass";
        this.filter.frequency.value = this.filterCutoff;
        this.filter.Q.value = this.filterQ;
        this.shaper.curve = this.makeDistortionCurve(this.distAmount);

        // Chain: voiceGain -> filter -> shaper -> master -> analyser -> destination
        this.voiceGain.connect(this.filter);
        this.filter.connect(this.shaper);
        this.shaper.connect(this.master);
        this.master.connect(this.analyser);
        this.analyser.connect(this.ctx.destination);

        // Prepare recorder branches but do not start
        this.mediaDest = this.ctx.createMediaStreamDestination();
        this.master.connect(this.mediaDest);
    }

    async resume() {
        this.ensureContext();
        if (this.ctx!.state !== "running") await this.ctx!.resume();
    }

    // --- Synthesis controls ---
    setWave(type: Wave) {
        this.currentWave = type;
        if (this.osc) this.osc.type = type;
    }

    setFrequency(freq: number) {
        this.currentFreq = freq;
        if (this.osc && this.ctx) this.osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    }

    setMasterGain(gain: number) {
        this.currentMaster = Math.max(0, Math.min(1, gain));
        if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.currentMaster, this.ctx.currentTime, 0.01);
    }

    setFilterCutoff(hz: number) {
        this.filterCutoff = Math.max(20, Math.min(20000, hz));
        if (this.filter && this.ctx) this.filter.frequency.setTargetAtTime(this.filterCutoff, this.ctx.currentTime, 0.01);
    }

    setFilterQ(q: number) {
        this.filterQ = Math.max(0.0001, Math.min(40, q));
        if (this.filter && this.ctx) this.filter.Q.setTargetAtTime(this.filterQ, this.ctx.currentTime, 0.01);
    }

    setDistortion(amount01: number) {
        this.distAmount = Math.max(0, Math.min(1, amount01));
        if (this.shaper) this.shaper.curve = this.makeDistortionCurve(this.distAmount);
    }

    setADSR(attack: number, decay: number, sustain: number, release: number) {
        this.adsr = {
            attack: Math.max(0, attack),
            decay: Math.max(0, decay),
            sustain: Math.max(0, Math.min(1, sustain)),
            release: Math.max(0, release),
        };
    }

    private makeDistortionCurve(amount01: number) {
        const n = 44100;
        const curve = new Float32Array(n);
        const k = amount01 * 50; // 0..50
        for (let i = 0; i < n; i++) {
            const x = (i / (n - 1)) * 2 - 1; // -1..1
            curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
        }
        return curve;
    }

    // --- Playback ---
    startTestTone(freq = this.currentFreq, type: Wave = this.currentWave) {
        this.ensureContext();
        if (this.osc) return; // already running
        const now = this.ctx!.currentTime;

        const osc = this.ctx!.createOscillator();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);
        this.osc = osc;

        // Connect osc -> voiceGain (already in chain)
        osc.connect(this.voiceGain!);
        osc.start();

        // Envelope on
        const g = this.voiceGain!.gain;
        const { attack, decay, sustain } = this.adsr;
        g.cancelScheduledValues(now);
        g.setValueAtTime(0, now);
        g.linearRampToValueAtTime(1, now + Math.max(0.001, attack));
        g.linearRampToValueAtTime(sustain, now + Math.max(0.001, attack) + Math.max(0.001, decay));
    }

    stopTestTone() {
        if (!this.osc || !this.ctx) return;
        const now = this.ctx.currentTime;
        const { release } = this.adsr;
        const g = this.voiceGain!.gain;
        g.cancelScheduledValues(now);
        const current = g.value;
        g.setValueAtTime(current, now);
        g.linearRampToValueAtTime(0, now + Math.max(0.001, release));

        const oscToStop = this.osc;
        this.osc = undefined;
        // Stop after release finishes
        oscToStop.stop(now + Math.max(0.001, release) + 0.01);
        // Disconnect slightly later
        setTimeout(() => {
            try {
                oscToStop.disconnect();
            } catch {}
        }, (Math.max(0.001, release) + 0.05) * 1000);
    }

    // --- Recording ---
    isRecording() {
        return !!this.recMode;
    }

    startRecording(format: "wav" | "mp3" = "wav"): { mode: "wav" | "mp3" | "webm"; mimeType: string } {
        this.ensureContext();
        if (!this.ctx) throw new Error("AudioContext not ready");
        if (this.recMode) throw new Error("Already recording");

        if (format === "wav") {
            // Capture via ScriptProcessor into Float32 chunks
            const proc = this.ctx.createScriptProcessor(4096, 1, 1);
            this.scriptProc = proc;
            this.wavChunks = [];
            proc.onaudioprocess = (e) => {
                const input = e.inputBuffer.getChannelData(0);
                // Copy to avoid re-use of the underlying buffer
                this.wavChunks.push(new Float32Array(input));
                // keep output silent
                const out = e.outputBuffer.getChannelData(0);
                out.fill(0);
            };
            // Branch master to processor, and processor to destination (silent but keeps it alive)
            this.master!.connect(proc);
            proc.connect(this.ctx.destination);
            this.recMode = "wav";
            return { mode: "wav", mimeType: "audio/wav" };
        }

        // Try MediaRecorder for MP3, fallback to WebM/Opus
        const candidates = [
            "audio/mpeg", // mp3
            "audio/webm;codecs=opus",
            "audio/ogg;codecs=opus",
            "audio/webm",
        ];
        const supported = candidates.find((c) => (window as any).MediaRecorder && (window as any).MediaRecorder.isTypeSupported?.(c));
        if (!supported) {
            // Fall back to wav if MediaRecorder not supported
            return this.startRecording("wav");
        }

        this.mediaChunks = [];
        const rec = new MediaRecorder(this.mediaDest!.stream, { mimeType: supported });
        this.mediaRecorder = rec;
        rec.ondataavailable = (e) => {
            if (e.data && e.data.size) this.mediaChunks.push(e.data);
        };
        rec.start();
        this.recMode = supported === "audio/mpeg" ? "mp3" : "webm";
        return { mode: this.recMode, mimeType: supported };
    }

    async stopRecording(): Promise<Blob> {
        if (!this.ctx || !this.recMode) throw new Error("Not recording");

        const mode = this.recMode;
        this.recMode = undefined;

        if (mode === "wav") {
            // Detach processor
            try {
                this.scriptProc?.disconnect();
                this.master?.disconnect(this.scriptProc!);
            } catch {}
            const chunks = this.wavChunks;
            this.wavChunks = [];
            // Concatenate Float32 chunks
            const length = chunks.reduce((sum, a) => sum + a.length, 0);
            const samples = new Float32Array(length);
            let offset = 0;
            for (const a of chunks) {
                samples.set(a, offset);
                offset += a.length;
            }
            const wav = this.encodeWav(samples, this.ctx.sampleRate);
            return wav;
        }

        // MediaRecorder path
        const recorder = this.mediaRecorder!;
        if (!recorder) throw new Error("Recorder missing");
        const mimeType = recorder.mimeType;
        const chunks = this.mediaChunks;
        const done = new Promise<Blob>((resolve) => {
            recorder.onstop = () => {
                const blob = new Blob(chunks.slice(), { type: mimeType });
                // clear
                this.mediaChunks = [];
                resolve(blob);
            };
        });
        recorder.stop();
        return done;
    }

    private encodeWav(samples: Float32Array, sampleRate: number): Blob {
        // 16-bit PCM WAV
        const numChannels = 1;
        const bytesPerSample = 2;
        const blockAlign = numChannels * bytesPerSample;
        const byteRate = sampleRate * blockAlign;
        const dataSize = samples.length * bytesPerSample;
        const buffer = new ArrayBuffer(44 + dataSize);
        const view = new DataView(buffer);

        // RIFF header
        this.writeString(view, 0, "RIFF");
        view.setUint32(4, 36 + dataSize, true);
        this.writeString(view, 8, "WAVE");
        // fmt chunk
        this.writeString(view, 12, "fmt ");
        view.setUint32(16, 16, true); // PCM chunk size
        view.setUint16(20, 1, true); // PCM format
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, byteRate, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, 16, true); // bits per sample
        // data chunk
        this.writeString(view, 36, "data");
        view.setUint32(40, dataSize, true);

        // PCM samples
        let offset = 44;
        for (let i = 0; i < samples.length; i++, offset += 2) {
            // Clamp to [-1, 1], then scale to 16-bit
            let s = samples[i];
            s = Math.max(-1, Math.min(1, s));
            view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        }

        return new Blob([view], { type: "audio/wav" });
    }

    private writeString(view: DataView, offset: number, str: string) {
        for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    }
}
