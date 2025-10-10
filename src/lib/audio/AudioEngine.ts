/* eslint-disable @typescript-eslint/no-explicit-any */
// src/lib/audio/AudioEngine.ts
export type Wave = "sine" | "square" | "sawtooth" | "triangle" | "custom";

export class AudioEngine {
    ctx?: AudioContext;
    analyser?: AnalyserNode;
    master?: GainNode;

    // Synthesis chain
    private osc?: OscillatorNode; // legacy single-tone path (drone)
    private mixGain?: GainNode; // mix of voices + noise before FX
    private filter?: BiquadFilterNode;
    private shaper?: WaveShaperNode;
    private customWave?: PeriodicWave;
    private customSamples?: Float32Array;

    // Polyphony
    private voices: Map<string | number, { osc: OscillatorNode; gain: GainNode } > = new Map();

    // LFO
    private lfoOsc?: OscillatorNode;
    private lfoGainPitch?: GainNode;
    private lfoGainFilter?: GainNode;
    private lfoGainAmp?: GainNode;
    private lfoRate = 5; // Hz
    private vibratoCents = 0; // +/- cents
    private filterLfoHz = 0; // +/- Hz
    private tremoloDepth = 0; // 0..1 (applied around baseline)

    // Noise
    private noiseGain?: GainNode;
    private noiseSrc?: AudioBufferSourceNode;
    private noiseLevel = 0; // 0..1

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
        this.mixGain = this.ctx.createGain();
        this.filter = this.ctx.createBiquadFilter();
        this.shaper = this.ctx.createWaveShaper();

        // Configure
        this.analyser.fftSize = 2048;
        this.master.gain.value = this.currentMaster;
        this.mixGain.gain.value = 1; // voice envelopes modulate per-voice
        this.filter.type = "lowpass";
        this.filter.frequency.value = this.filterCutoff;
        this.filter.Q.value = this.filterQ;
        this.shaper.curve = this.makeDistortionCurve(this.distAmount);

        // Chain: mix -> filter -> shaper -> master -> analyser -> destination
        this.mixGain.connect(this.filter);
        this.filter.connect(this.shaper);
        this.shaper.connect(this.master);
        this.master.connect(this.analyser);
        this.analyser.connect(this.ctx.destination);

        // Noise branch
        this.noiseGain = this.ctx.createGain();
        this.noiseGain.gain.value = this.noiseLevel;
        this.noiseGain.connect(this.mixGain);
        const noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
        const data = noiseBuf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        this.noiseSrc = this.ctx.createBufferSource();
        this.noiseSrc.buffer = noiseBuf;
        this.noiseSrc.loop = true;
        this.noiseSrc.connect(this.noiseGain);
        this.noiseSrc.start();

        // LFO setup
        this.lfoOsc = this.ctx.createOscillator();
        this.lfoGainPitch = this.ctx.createGain();
        this.lfoGainFilter = this.ctx.createGain();
        this.lfoGainAmp = this.ctx.createGain();
        this.lfoOsc.type = "sine";
        this.lfoOsc.frequency.value = this.lfoRate;
        this.lfoGainPitch.gain.value = this.vibratoCents; // cents directly into detune
        this.lfoGainFilter.gain.value = this.filterLfoHz; // Hz into frequency
        this.lfoGainAmp.gain.value = this.tremoloDepth * 0.5; // centered around baseline
        this.lfoOsc.connect(this.lfoGainPitch);
        this.lfoOsc.connect(this.lfoGainFilter);
        this.lfoOsc.connect(this.lfoGainAmp);
        // Connect filter LFO and amp LFO to targets
        this.lfoGainFilter.connect(this.filter.frequency);
        this.lfoGainAmp.connect(this.mixGain.gain);
        this.lfoOsc.start();

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
        if (this.osc) {
            if (type === "custom") {
                if (this.customWave) this.osc.setPeriodicWave(this.customWave);
            } else {
                this.osc.type = type;
            }
        }
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

    // --- LFO and Noise controls ---
    setLfoRate(hz: number) {
        this.lfoRate = Math.max(0.1, Math.min(30, hz));
        if (this.lfoOsc) this.lfoOsc.frequency.value = this.lfoRate;
    }
    setVibratoCents(cents: number) {
        this.vibratoCents = Math.max(0, Math.min(200, cents));
        if (this.lfoGainPitch) this.lfoGainPitch.gain.value = this.vibratoCents;
        // reconnect to active oscillators
        this.voices.forEach((v) => {
            try {
                this.lfoGainPitch!.disconnect(v.osc.detune);
            } catch {}
            this.lfoGainPitch!.connect(v.osc.detune);
        });
        if (this.osc) {
            try { this.lfoGainPitch!.disconnect(this.osc.detune); } catch {}
            this.lfoGainPitch!.connect(this.osc.detune);
        }
    }
    setFilterLfoDepth(hz: number) {
        this.filterLfoHz = Math.max(0, Math.min(5000, hz));
        if (this.lfoGainFilter) this.lfoGainFilter.gain.value = this.filterLfoHz;
    }
    setTremoloDepth(amount01: number) {
        this.tremoloDepth = Math.max(0, Math.min(1, amount01));
        if (this.lfoGainAmp) this.lfoGainAmp.gain.value = this.tremoloDepth * 0.5;
    }
    setNoiseLevel(amount01: number) {
        this.noiseLevel = Math.max(0, Math.min(1, amount01));
        if (this.noiseGain) this.noiseGain.gain.value = this.noiseLevel;
    }

    // --- Playback ---
    startTestTone(freq = this.currentFreq, type: Wave = this.currentWave) {
        this.ensureContext();
        if (this.osc) return; // already running
        const now = this.ctx!.currentTime;

        const osc = this.ctx!.createOscillator();
        if (type === "custom" && this.customWave) {
            osc.setPeriodicWave(this.customWave);
        } else {
            osc.type = type as OscillatorType;
        }
        osc.frequency.setValueAtTime(freq, now);
        this.osc = osc;

        // Connect osc -> individual gain -> mix
        const gnode = this.ctx!.createGain();
        gnode.gain.value = 0;
        osc.connect(gnode);
        gnode.connect(this.mixGain!);
        // connect LFO pitch
        if (this.lfoGainPitch) this.lfoGainPitch.connect(osc.detune);
        // Store as a voice under key 'drone'
        this.voices.set("drone", { osc, gain: gnode });
        // For envelope on drone
        osc.start();

        // Envelope on
        const g = gnode.gain;
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
        const voice = this.voices.get("drone");
        const g = voice ? voice.gain.gain : this.mixGain!.gain;
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
            try { this.voices.delete("drone"); } catch {}
        }, (Math.max(0.001, release) + 0.05) * 1000);
    }

    noteOn(noteNumber: number, velocity = 1, id: number | string = noteNumber) {
        this.ensureContext();
        const now = this.ctx!.currentTime;
        if (this.voices.has(id)) return; // already playing
        const osc = this.ctx!.createOscillator();
        if (this.currentWave === "custom" && this.customWave) osc.setPeriodicWave(this.customWave);
        else osc.type = this.currentWave as OscillatorType;
        const freq = 440 * Math.pow(2, (noteNumber - 69) / 12);
        osc.frequency.setValueAtTime(freq, now);
        const vGain = this.ctx!.createGain();
        vGain.gain.value = 0;
        osc.connect(vGain);
        vGain.connect(this.mixGain!);
        // LFO pitch routing
        if (this.lfoGainPitch) this.lfoGainPitch.connect(osc.detune);
        osc.start();
        // ADSR gate on
        const g = vGain.gain;
        const { attack, decay, sustain } = this.adsr;
        g.cancelScheduledValues(now);
        g.setValueAtTime(0, now);
        g.linearRampToValueAtTime(velocity, now + Math.max(0.001, attack));
        g.linearRampToValueAtTime(velocity * sustain, now + Math.max(0.001, attack) + Math.max(0.001, decay));
        this.voices.set(id, { osc, gain: vGain });
    }

    noteOff(id: number | string) {
        if (!this.ctx) return;
        const voice = this.voices.get(id);
        if (!voice) return;
        const now = this.ctx.currentTime;
        const { release } = this.adsr;
        voice.gain.gain.cancelScheduledValues(now);
        const current = voice.gain.gain.value;
        voice.gain.gain.setValueAtTime(current, now);
        voice.gain.gain.linearRampToValueAtTime(0, now + Math.max(0.001, release));
        const osc = voice.osc;
        this.voices.delete(id);
        try {
            osc.stop(now + Math.max(0.001, release) + 0.01);
        } catch {}
        setTimeout(() => {
            try { osc.disconnect(); } catch {}
            try { voice.gain.disconnect(); } catch {}
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

    // --- Custom waveform ---
    setCustomWaveShape(samples: Float32Array) {
        this.ensureContext();
        if (!this.ctx) return;
        // Clamp / normalize to [-1, 1]
        const M = samples.length;
        const s = new Float32Array(M);
        for (let i = 0; i < M; i++) s[i] = Math.max(-1, Math.min(1, samples[i]));
        this.customSamples = s;

        const harmonics = Math.min(64, Math.floor(M / 2));
        const real = new Float32Array(harmonics + 1);
        const imag = new Float32Array(harmonics + 1);

        // DFT to cosine (real) / sine (imag) coefficients
        // WebAudio expects index 0 to be DC (real[0]) and imag[0] = 0.
        // Scale with 2/M to match standard Fourier series for periodic signals.
        let sum = 0;
        for (let n = 0; n < M; n++) sum += s[n];
        real[0] = (2 / M) * sum; // DC
        imag[0] = 0;

        for (let k = 1; k <= harmonics; k++) {
            let ak = 0;
            let bk = 0;
            for (let n = 0; n < M; n++) {
                const phase = (2 * Math.PI * k * n) / M;
                const v = s[n];
                ak += v * Math.cos(phase);
                bk += v * Math.sin(phase);
            }
            real[k] = (2 / M) * ak;
            imag[k] = (2 / M) * bk;
        }

        try {
            // Let the system normalize magnitudes to avoid loudness jumps
            this.customWave = this.ctx.createPeriodicWave(real, imag, { disableNormalization: false });
        } catch {
            this.customWave = this.ctx.createPeriodicWave(real, imag);
        }

        if (this.currentWave === "custom" && this.osc && this.customWave) {
            this.osc.setPeriodicWave(this.customWave);
        }

        // Also update any active poly voices
        if (this.currentWave === "custom" && this.customWave) {
            this.voices.forEach((v) => {
                try { v.osc.setPeriodicWave(this.customWave!); } catch {}
            });
        }
    }

    // --- Offline rendering for sample export ---
    async renderNoteToWav(noteNumber: number, seconds = 2): Promise<Blob> {
        // Use 44100 for broad compatibility
        const sampleRate = 44100;
        const frames = Math.floor(sampleRate * seconds);
        const ctx = new OfflineAudioContext(1, frames, sampleRate);
        // Build chain: osc -> vGain -> filter -> shaper -> outGain -> destination
        const outGain = ctx.createGain();
        outGain.gain.value = this.currentMaster;
        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = this.filterCutoff;
        filter.Q.value = this.filterQ;
        const shaper = ctx.createWaveShaper();
        shaper.curve = this.makeDistortionCurve(this.distAmount);
        // Connect
        filter.connect(shaper);
        shaper.connect(outGain);
        outGain.connect(ctx.destination);

        // Optional noise
        if (this.noiseLevel > 0) {
            const nGain = ctx.createGain();
            nGain.gain.value = this.noiseLevel;
            const noiseBuf = ctx.createBuffer(1, sampleRate * Math.max(1, Math.floor(seconds)), sampleRate);
            const d = noiseBuf.getChannelData(0);
            for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
            const nSrc = ctx.createBufferSource();
            nSrc.buffer = noiseBuf; nSrc.loop = true; nSrc.connect(nGain); nGain.connect(filter);
            nSrc.start(0);
        }

        // Voice
        const osc = ctx.createOscillator();
        if (this.currentWave === "custom" && this.customSamples) {
            // rebuild periodic wave in offline context
            const { real, imag } = this.buildPeriodicFromSamples(this.customSamples, 64);
            try { osc.setPeriodicWave(ctx.createPeriodicWave(real, imag, { disableNormalization: false })); }
            catch { osc.setPeriodicWave(ctx.createPeriodicWave(real, imag)); }
        } else {
            osc.type = this.currentWave as OscillatorType;
        }
        const freq = 440 * Math.pow(2, (noteNumber - 69) / 12);
        osc.frequency.value = freq;
        const vGain = ctx.createGain();
        vGain.gain.value = 0;
        osc.connect(vGain);
        vGain.connect(filter);
        const now = 0;
        const { attack, decay, sustain, release } = this.adsr;
        vGain.gain.setValueAtTime(0, now);
        vGain.gain.linearRampToValueAtTime(1, now + Math.max(0.001, attack));
        vGain.gain.linearRampToValueAtTime(sustain, now + Math.max(0.001, attack) + Math.max(0.001, decay));
        // Schedule stop with release tail
        const tail = Math.min(1.5, Math.max(0.05, release));
        const gateOff = Math.max(0.05, seconds - tail - 0.02);
        vGain.gain.setValueAtTime(vGain.gain.value, gateOff);
        vGain.gain.linearRampToValueAtTime(0, gateOff + tail);
        osc.start(now);
        osc.stop(seconds);

        const rendered = await ctx.startRendering();
        const chan = rendered.getChannelData(0);
        return this.encodeWav(new Float32Array(chan), sampleRate);
    }

    private buildPeriodicFromSamples(samples: Float32Array, maxHarmonics = 64) {
        const M = samples.length;
        const s = new Float32Array(M);
        for (let i = 0; i < M; i++) s[i] = Math.max(-1, Math.min(1, samples[i]));
        const harmonics = Math.min(maxHarmonics, Math.floor(M / 2));
        const real = new Float32Array(harmonics + 1);
        const imag = new Float32Array(harmonics + 1);
        let sum = 0;
        for (let n = 0; n < M; n++) sum += s[n];
        real[0] = (2 / M) * sum; imag[0] = 0;
        for (let k = 1; k <= harmonics; k++) {
            let ak = 0, bk = 0;
            for (let n = 0; n < M; n++) {
                const phase = (2 * Math.PI * k * n) / M;
                const v = s[n];
                ak += v * Math.cos(phase);
                bk += v * Math.sin(phase);
            }
            real[k] = (2 / M) * ak; imag[k] = (2 / M) * bk;
        }
        return { real, imag };
    }
}
