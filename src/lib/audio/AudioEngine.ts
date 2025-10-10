/* eslint-disable @typescript-eslint/no-explicit-any */
// src/lib/audio/AudioEngine.ts
export type Wave = "sine" | "square" | "sawtooth" | "triangle" | "custom";
export type BuiltInInstrumentId = "synth" | "piano" | "guitar" | "organ" | "bass" | "drums";
export type InstrumentId = BuiltInInstrumentId | `user-${string}`;

export const INSTRUMENT_OPTIONS: Array<{ id: BuiltInInstrumentId; label: string }> = [
    { id: "synth", label: "Synth Engine" },
    { id: "piano", label: "Piano" },
    { id: "guitar", label: "Guitar" },
    { id: "organ", label: "Organ" },
    { id: "bass", label: "Bass" },
    { id: "drums", label: "Drum Kit" },
];

type SynthVoice = {
    kind: "synth";
    oscs: OscillatorNode[];
    gain: GainNode;
    startedAt: number;
    freq: number;
    filter?: BiquadFilterNode;
    panners?: StereoPannerNode[];
};

type SampleVoice = {
    kind: "sample";
    source: AudioBufferSourceNode;
    gain: GainNode;
    startedAt: number;
    freq: number;
    filter?: BiquadFilterNode;
};

type DrumVoice = {
    kind: "drum";
    source: AudioBufferSourceNode;
    gain: GainNode;
    startedAt: number;
    freq: number;
    filter?: BiquadFilterNode;
};

type VoiceState = SynthVoice | SampleVoice | DrumVoice;

type SampleInstrumentDefinition = { kind: "sample"; src: string; rootNote: number; buffer?: AudioBuffer };
type DrumKitDefinition = { kind: "drumkit"; mapping: Record<number, string>; fallback: string };
type InstrumentDefinition =
    | { kind: "engine" }
    | SampleInstrumentDefinition
    | DrumKitDefinition;

const BASE_INSTRUMENT_LIBRARY: Record<BuiltInInstrumentId, InstrumentDefinition> = {
    synth: { kind: "engine" },
    piano: { kind: "sample", src: "/samples/instruments/piano-c4.wav", rootNote: 60 },
    guitar: { kind: "sample", src: "/samples/instruments/guitar-c4.wav", rootNote: 60 },
    organ: { kind: "sample", src: "/samples/instruments/organ-c4.wav", rootNote: 60 },
    bass: { kind: "sample", src: "/samples/instruments/bass-c2.wav", rootNote: 36 },
    drums: {
        kind: "drumkit",
        mapping: {
            36: "/samples/instruments/drum-kick.wav",
            37: "/samples/instruments/drum-snare.wav",
            38: "/samples/instruments/drum-snare.wav",
            40: "/samples/instruments/drum-snare.wav",
            42: "/samples/instruments/drum-hihat.wav",
            44: "/samples/instruments/drum-hihat.wav",
            46: "/samples/instruments/drum-hihat.wav",
        },
        fallback: "/samples/instruments/drum-hihat.wav",
    },
};

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
    private voices: Map<string | number, VoiceState> = new Map();

    // LFO
    private lfoOsc?: OscillatorNode;
    private lfoGainPitch?: GainNode;
    private lfoGainFilter?: GainNode;
    private lfoGainAmp?: GainNode;
    private lfoRate = 5; // Hz
    private vibratoCents = 0; // +/- cents
    private filterLfoCents = 0; // +/- cents
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
    private currentInstrument: InstrumentId = "synth";

    // Filter envelope (global)
    private fenv = { attack: 0.005, decay: 0.2, sustain: 0.0, release: 0.2, amountHz: 0 };

    // Velocity sensitivity
    private ampVelSense = 1; // 0..1 (0 = velocity ignored, 1 = full)
    private filtVelSense = 0.5; // 0..1 scales filter env amount by velocity
    private filtKeytrack = 0; // 0..1, 0=no keytrack, 1=1:1 per semitone

    // Polyphony
    private maxVoices = 16;
    private unisonCount = 1; // 1..7
    private unisonDetune = 0; // cents peak spread
    private stereoSpread = 0; // 0..1

    // Recording
    private recMode?: "wav" | "mp3" | "webm";
    private scriptProc?: ScriptProcessorNode; // legacy wav capture (unused)
    private wavChunks: Float32Array[] = [];
    private mediaDest?: MediaStreamAudioDestinationNode; // for MediaRecorder
    private mediaRecorder?: MediaRecorder;
    private mediaChunks: BlobPart[] = [];
    private recorderNode?: AudioWorkletNode;
    private workletLoaded = false;

    // FX
    private delay?: DelayNode;
    private delayFeedback?: GainNode;
    private delaySend?: GainNode;
    private delayTime = 0.25;
    private delayFeedbackAmt = 0.25;
    private delayMix = 0; // send level 0..1

    private reverb?: ConvolverNode;
    private reverbSend?: GainNode;
    private reverbMix = 0; // send level 0..1
    private reverbSize = 2.0; // seconds

    // Samples
    private instrumentDefs: Map<string, InstrumentDefinition> = new Map(
        Object.entries(BASE_INSTRUMENT_LIBRARY)
    );
    private sampleCache: Map<string, AudioBuffer> = new Map();
    private instrumentReady?: Promise<void>;

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
        this.mixGain.gain.value = 1 - this.tremoloDepth * 0.5; // baseline for tremolo
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

        // Noise branch (lazy start)
        this.noiseGain = this.ctx.createGain();
        this.noiseGain.gain.value = this.noiseLevel;
        this.noiseGain.connect(this.mixGain);
        if (this.noiseLevel > 0) this.startNoiseSrc();

        // FX: Delay (send)
        this.delay = this.ctx.createDelay(2.0);
        this.delayFeedback = this.ctx.createGain();
        this.delaySend = this.ctx.createGain();
        this.delay.delayTime.value = this.delayTime;
        this.delayFeedback.gain.value = this.delayFeedbackAmt;
        this.delaySend.gain.value = this.delayMix;
        this.shaper.connect(this.delaySend);
        this.delaySend.connect(this.delay);
        this.delay.connect(this.delayFeedback);
        this.delayFeedback.connect(this.delay);
        this.delay.connect(this.master);

        // FX: Reverb (send)
        this.reverb = this.ctx.createConvolver();
        this.reverbSend = this.ctx.createGain();
        this.reverbSend.gain.value = this.reverbMix;
        this.reverb.buffer = this.makeImpulseResponse(this.ctx.sampleRate, this.reverbSize);
        this.shaper.connect(this.reverbSend);
        this.reverbSend.connect(this.reverb);
        this.reverb.connect(this.master);

        // LFO setup
        this.lfoOsc = this.ctx.createOscillator();
        this.lfoGainPitch = this.ctx.createGain();
        this.lfoGainFilter = this.ctx.createGain();
        this.lfoGainAmp = this.ctx.createGain();
        this.lfoOsc.type = "sine";
        this.lfoOsc.frequency.value = this.lfoRate;
        this.lfoGainPitch.gain.value = this.vibratoCents; // cents directly into detune
        this.lfoGainFilter.gain.value = this.filterLfoCents; // cents into detune
        this.lfoGainAmp.gain.value = this.tremoloDepth * 0.5; // amplitude around baseline
        this.lfoOsc.connect(this.lfoGainPitch);
        this.lfoOsc.connect(this.lfoGainFilter);
        this.lfoOsc.connect(this.lfoGainAmp);
        // Connect filter LFO and amp LFO to targets (prefer detune if available)
        try {
            (this.lfoGainFilter as GainNode).connect((this.filter as any).detune ?? this.filter.frequency);
        } catch {
            this.lfoGainFilter.connect(this.filter.frequency);
        }
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

    async setInstrument(id: InstrumentId) {
        this.currentInstrument = id;
        this.allNotesOff();
        const def = this.instrumentDefs.get(id);
        if (!def) return;
        if (def.kind === "engine") {
            this.instrumentReady = undefined;
            return;
        }
        const promise = this.loadInstrument(def);
        this.instrumentReady = promise;
        await promise;
        if (this.instrumentReady === promise) this.instrumentReady = undefined;
    }

    private async loadInstrument(def: InstrumentDefinition) {
        this.ensureContext();
        if (!this.ctx) return;
        if (def.kind === "sample") {
            if (def.buffer) this.sampleCache.set(def.src, def.buffer);
            else await this.loadSample(def.src);
            return;
        }
        if (def.kind === "drumkit") {
            const paths = Array.from(new Set([...Object.values(def.mapping), def.fallback]));
            await Promise.all(paths.map((p) => this.loadSample(p)));
        }
    }

    async addUserInstrument(data: ArrayBuffer, rootNote = 60): Promise<InstrumentId> {
        this.ensureContext();
        if (!this.ctx) throw new Error("AudioContext not ready");
        const copy = data.slice(0);
        const buffer = await this.ctx.decodeAudioData(copy);
        const id: InstrumentId = `user-${Date.now().toString(16)}-${Math.floor(Math.random() * 1e6)}`;
        const key = `user:${id}`;
        const def: SampleInstrumentDefinition = { kind: "sample", src: key, rootNote, buffer };
        this.instrumentDefs.set(id, def);
        this.sampleCache.set(key, buffer);
        return id;
    }

    private async loadSample(path: string) {
        if (this.sampleCache.has(path)) return this.sampleCache.get(path)!;
        if (typeof window === "undefined") throw new Error("No window");
        const res = await fetch(path);
        if (!res.ok) throw new Error(`Failed to load sample ${path} (${res.status})`);
        const arrayBuffer = await res.arrayBuffer();
        this.ensureContext();
        if (!this.ctx) throw new Error("AudioContext not ready");
        const buffer = await this.ctx.decodeAudioData(arrayBuffer);
        this.sampleCache.set(path, buffer);
        return buffer;
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

    setFilterEnv(attack: number, decay: number, sustain: number, release: number, amountHz: number) {
        this.fenv = {
            attack: Math.max(0, attack),
            decay: Math.max(0, decay),
            sustain: Math.max(0, Math.min(1, sustain)),
            release: Math.max(0, release),
            amountHz: Math.max(0, amountHz),
        };
    }

    setAmpVelocitySensitivity(amount01: number) {
        this.ampVelSense = Math.max(0, Math.min(1, amount01));
    }

    setFilterVelocitySensitivity(amount01: number) {
        this.filtVelSense = Math.max(0, Math.min(1, amount01));
    }

    setMaxVoices(n: number) {
        this.maxVoices = Math.max(1, Math.floor(n));
    }

    setUnisonCount(n: number) {
        this.unisonCount = Math.max(1, Math.min(7, Math.floor(n)));
    }
    setUnisonDetune(cents: number) {
        this.unisonDetune = Math.max(0, Math.min(100, cents));
    }
    setStereoSpread(amount01: number) {
        this.stereoSpread = Math.max(0, Math.min(1, amount01));
    }

    setFilterKeytrack(amount01: number) {
        this.filtKeytrack = Math.max(0, Math.min(1, amount01));
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
            if (v.kind !== "synth") return;
            v.oscs.forEach((o) => {
                try {
                    this.lfoGainPitch!.disconnect(o.detune);
                } catch {}
                this.lfoGainPitch!.connect(o.detune);
            });
        });
        if (this.osc) {
            try { this.lfoGainPitch!.disconnect(this.osc.detune); } catch {}
            this.lfoGainPitch!.connect(this.osc.detune);
        }
    }
    setFilterLfoDepth(hz: number) {
        // Interpret as cents for musical mapping
        const cents = Math.max(0, Math.min(4800, hz));
        this.filterLfoCents = cents;
        if (this.lfoGainFilter) this.lfoGainFilter.gain.value = cents;
    }
    setTremoloDepth(amount01: number) {
        this.tremoloDepth = Math.max(0, Math.min(1, amount01));
        if (this.mixGain) this.mixGain.gain.value = 1 - this.tremoloDepth * 0.5;
        if (this.lfoGainAmp) this.lfoGainAmp.gain.value = this.tremoloDepth * 0.5;
    }
    setNoiseLevel(amount01: number) {
        this.noiseLevel = Math.max(0, Math.min(1, amount01));
        if (this.noiseGain) this.noiseGain.gain.value = this.noiseLevel;
        if (!this.ctx) return;
        if (this.noiseLevel > 0 && !this.noiseSrc) this.startNoiseSrc();
        if (this.noiseLevel === 0 && this.noiseSrc) {
            try { this.noiseSrc.stop(); } catch {}
            try { this.noiseSrc.disconnect(); } catch {}
            this.noiseSrc = undefined;
        }
    }

    setDelay(time: number, feedback: number, mix: number) {
        this.delayTime = Math.max(0, Math.min(2, time));
        this.delayFeedbackAmt = Math.max(0, Math.min(0.95, feedback));
        this.delayMix = Math.max(0, Math.min(1, mix));
        if (this.delay) this.delay.delayTime.value = this.delayTime;
        if (this.delayFeedback) this.delayFeedback.gain.value = this.delayFeedbackAmt;
        if (this.delaySend) this.delaySend.gain.value = this.delayMix;
    }
    setReverb(sizeSec: number, mix: number) {
        this.reverbSize = Math.max(0.1, Math.min(6, sizeSec));
        this.reverbMix = Math.max(0, Math.min(1, mix));
        if (this.reverbSend) this.reverbSend.gain.value = this.reverbMix;
        if (this.reverb && this.ctx) this.reverb.buffer = this.makeImpulseResponse(this.ctx.sampleRate, this.reverbSize);
    }

    // --- Playback ---
    startTestTone(freq = this.currentFreq, type: Wave = this.currentWave) {
        this.ensureContext();
        if (this.osc) return; // already running
        const now = this.ctx!.currentTime;

        const osc = this.ctx!.createOscillator();
        if (type === "custom" && this.customSamples) {
            const { real, imag } = this.buildPeriodicForFreq(this.customSamples, freq, this.ctx!.sampleRate);
            try { osc.setPeriodicWave(this.ctx!.createPeriodicWave(real, imag, { disableNormalization: false })); }
            catch { osc.setPeriodicWave(this.ctx!.createPeriodicWave(real, imag)); }
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
        const droneVoice: SynthVoice = { kind: "synth", oscs: [osc], gain: gnode, startedAt: now, freq };
        this.voices.set("drone", droneVoice);
        // For envelope on drone
        osc.start();

        // Envelope on
        const g = gnode.gain;
        const { attack, decay, sustain } = this.adsr;
        g.cancelScheduledValues(now);
        g.setValueAtTime(0, now);
        const peak = this.lerp(1, 1, this.ampVelSense);
        g.linearRampToValueAtTime(peak, now + Math.max(0.001, attack));
        g.linearRampToValueAtTime(peak * sustain, now + Math.max(0.001, attack) + Math.max(0.001, decay));

        // Filter envelope for drone (use full scale), keytracked base
        this.triggerFilterEnvForNote(now, 1, freq);
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

        // Filter env release back to base
        this.releaseFilterEnv(now);
    }

    allNotesOff() {
        if (!this.ctx) return;
        const ids = Array.from(this.voices.keys());
        ids.forEach((id) => this.noteOff(id));
        if (this.osc) this.stopTestTone();
        this.releaseFilterEnv(this.ctx.currentTime);
    }

    noteOn(noteNumber: number, velocity = 1, id: number | string = noteNumber) {
        this.ensureContext();
        if (!this.ctx) return;
        if (this.instrumentReady) {
            this.instrumentReady.then(() => this.noteOn(noteNumber, velocity, id));
            return;
        }
        const def = this.instrumentDefs.get(this.currentInstrument) ?? BASE_INSTRUMENT_LIBRARY.synth;
        const isDrum = def.kind === "drumkit";
        if (!isDrum && this.voices.has(id)) return;
        if (!isDrum) this.enforceVoiceLimit();
        if (def.kind === "engine") {
            this.noteOnSynth(noteNumber, velocity, id);
        } else if (def.kind === "sample") {
            this.noteOnSample(def, noteNumber, velocity, id);
        } else {
            this.noteOnDrum(def, noteNumber, velocity, id);
        }
    }

    private enforceVoiceLimit() {
        if (this.voices.size < this.maxVoices) return;
        let oldestKey: string | number | undefined;
        let oldestTime = Number.POSITIVE_INFINITY;
        this.voices.forEach((v, key) => {
            if (key === "drone") return;
            if (v.startedAt < oldestTime) {
                oldestTime = v.startedAt;
                oldestKey = key;
            }
        });
        if (oldestKey !== undefined) this.noteOff(oldestKey);
    }

    private noteOnSynth(noteNumber: number, velocity: number, id: number | string) {
        if (!this.ctx || !this.mixGain) return;
        const now = this.ctx.currentTime;
        const freq = 440 * Math.pow(2, (noteNumber - 69) / 12);
        const vGain = this.ctx.createGain();
        vGain.gain.value = 0;
        const vFilter = this.ctx.createBiquadFilter();
        vFilter.type = "lowpass";
        vFilter.Q.value = this.filterQ;
        const baseCut = this.computeKeytrackedCutoff(freq);
        vFilter.frequency.value = baseCut;
        vFilter.connect(vGain);
        vGain.connect(this.mixGain);
        const oscs: OscillatorNode[] = [];
        const pans: StereoPannerNode[] = [];
        const n = this.unisonCount;
        for (let i = 0; i < n; i++) {
            const osc = this.ctx.createOscillator();
            if (this.currentWave === "custom" && this.customSamples) {
                const { real, imag } = this.buildPeriodicForFreq(this.customSamples, freq, this.ctx.sampleRate);
                try {
                    osc.setPeriodicWave(this.ctx.createPeriodicWave(real, imag, { disableNormalization: false }));
                } catch {
                    osc.setPeriodicWave(this.ctx.createPeriodicWave(real, imag));
                }
            } else {
                osc.type = this.currentWave as OscillatorType;
            }
            osc.frequency.setValueAtTime(freq, now);
            const pos = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
            const cents = pos * this.unisonDetune;
            osc.detune.setValueAtTime(cents, now);
            const pan = this.ctx.createStereoPanner();
            pan.pan.value = pos * this.stereoSpread;
            const oGain = this.ctx.createGain();
            oGain.gain.value = 1 / Math.sqrt(n);
            osc.connect(oGain);
            oGain.connect(pan);
            pan.connect(vFilter);
            if (this.lfoGainPitch) this.lfoGainPitch.connect(osc.detune);
            osc.start();
            oscs.push(osc);
            pans.push(pan);
        }
        const g = vGain.gain;
        const { attack, decay, sustain } = this.adsr;
        g.cancelScheduledValues(now);
        g.setValueAtTime(0, now);
        const peak = this.lerp(1, velocity, this.ampVelSense);
        g.linearRampToValueAtTime(peak, now + Math.max(0.001, attack));
        g.linearRampToValueAtTime(peak * sustain, now + Math.max(0.001, attack) + Math.max(0.001, decay));
        const voice: SynthVoice = { kind: "synth", oscs, gain: vGain, startedAt: now, freq, filter: vFilter, panners: pans };
        this.voices.set(id, voice);
        this.triggerFilterEnvOn(vFilter.frequency, now, this.lerp(1, velocity, this.filtVelSense), baseCut);
    }

    private noteOnSample(def: SampleInstrumentDefinition, noteNumber: number, velocity: number, id: number | string) {
        if (!this.ctx || !this.mixGain) return;
        let buffer = this.sampleCache.get(def.src);
        if (!buffer && def.buffer) {
            buffer = def.buffer;
            this.sampleCache.set(def.src, buffer);
        }
        if (!buffer) {
            this.loadSample(def.src).then(() => this.noteOnSample(def, noteNumber, velocity, id));
            return;
        }
        const now = this.ctx.currentTime;
        const freq = 440 * Math.pow(2, (noteNumber - 69) / 12);
        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        const semis = noteNumber - def.rootNote;
        src.playbackRate.value = Math.pow(2, semis / 12);
        const vFilter = this.ctx.createBiquadFilter();
        vFilter.type = "lowpass";
        vFilter.Q.value = this.filterQ;
        const baseCut = this.computeKeytrackedCutoff(freq);
        vFilter.frequency.value = baseCut;
        const gain = this.ctx.createGain();
        const peak = this.lerp(1, velocity, this.ampVelSense);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(peak, now + 0.01);
        src.connect(vFilter);
        vFilter.connect(gain);
        gain.connect(this.mixGain);
        const voice: SampleVoice = { kind: "sample", source: src, gain, startedAt: now, freq, filter: vFilter };
        this.voices.set(id, voice);
        src.onended = () => {
            const existing = this.voices.get(id);
            if (existing && existing === voice) this.voices.delete(id);
            const endNow = this.ctx?.currentTime ?? now;
            this.releaseFilterEnvOn(vFilter.frequency, endNow, this.computeKeytrackedCutoff(freq));
            try { src.disconnect(); } catch {}
            try { vFilter.disconnect(); } catch {}
            try { gain.disconnect(); } catch {}
        };
        this.triggerFilterEnvOn(vFilter.frequency, now, this.lerp(1, velocity, this.filtVelSense), baseCut);
        src.start(now);
    }

    private noteOnDrum(def: DrumKitDefinition, noteNumber: number, velocity: number, id: number | string) {
        if (!this.ctx || !this.mixGain) return;
        const path = def.mapping[noteNumber] ?? def.fallback;
        const buffer = this.sampleCache.get(path);
        if (!buffer) {
            this.loadSample(path).then(() => this.noteOnDrum(def, noteNumber, velocity, id));
            return;
        }
        const now = this.ctx.currentTime;
        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        const gain = this.ctx.createGain();
        const peak = this.lerp(0.2, velocity, this.ampVelSense);
        gain.gain.value = peak;
        src.connect(gain);
        gain.connect(this.mixGain);
        const voiceKey = `${id}-${now.toFixed(6)}`;
        const voice: DrumVoice = { kind: "drum", source: src, gain, startedAt: now, freq: 0 };
        this.voices.set(voiceKey, voice);
        src.onended = () => {
            this.voices.delete(voiceKey);
            try { src.disconnect(); } catch {}
            try { gain.disconnect(); } catch {}
        };
        src.start(now);
    }

    noteOff(id: number | string) {
        if (!this.ctx) return;
        const voice = this.voices.get(id);
        if (!voice) return;
        const now = this.ctx.currentTime;
        const { release } = this.adsr;
        if (voice.kind === "synth") {
            voice.gain.gain.cancelScheduledValues(now);
            const current = voice.gain.gain.value;
            voice.gain.gain.setValueAtTime(current, now);
            voice.gain.gain.linearRampToValueAtTime(0, now + Math.max(0.001, release));
            const oscs = voice.oscs;
            this.voices.delete(id);
            try { oscs.forEach((o) => o.stop(now + Math.max(0.001, release) + 0.01)); } catch {}
            setTimeout(() => {
                try { oscs.forEach((o) => o.disconnect()); } catch {}
                try { voice.panners?.forEach((p) => p.disconnect()); } catch {}
                try { voice.filter?.disconnect(); } catch {}
                try { voice.gain.disconnect(); } catch {}
            }, (Math.max(0.001, release) + 0.05) * 1000);
        } else if (voice.kind === "sample") {
            voice.gain.gain.cancelScheduledValues(now);
            const current = voice.gain.gain.value;
            voice.gain.gain.setValueAtTime(current, now);
            voice.gain.gain.linearRampToValueAtTime(0, now + Math.max(0.001, release));
            this.voices.delete(id);
            try { voice.source.stop(now + Math.max(0.001, release) + 0.01); } catch {}
            setTimeout(() => {
                try { voice.source.disconnect(); } catch {}
                try { voice.filter?.disconnect(); } catch {}
                try { voice.gain.disconnect(); } catch {}
            }, (Math.max(0.001, release) + 0.05) * 1000);
        } else {
            // Drum voices are one-shots; stop immediately
            this.voices.delete(id);
            try { voice.source.stop(); } catch {}
            setTimeout(() => {
                try { voice.source.disconnect(); } catch {}
                try { voice.gain.disconnect(); } catch {}
            }, 50);
        }

        if (voice.filter) this.releaseFilterEnvOn(voice.filter.frequency, now, this.computeKeytrackedCutoff(voice.freq || this.currentFreq));
        else this.releaseFilterEnv(now);
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
            this.wavChunks = [];
            const start = async () => {
                if (!this.workletLoaded) {
                    await this.ctx!.audioWorklet.addModule('/worklets/recorder.js');
                    this.workletLoaded = true;
                }
                const node = new AudioWorkletNode(this.ctx!, 'recorder-processor', {
                    numberOfInputs: 1,
                    numberOfOutputs: 0,
                });
                node.port.onmessage = (e) => {
                    const buf = e.data as Float32Array;
                    if (buf && buf.length) this.wavChunks.push(new Float32Array(buf));
                };
                this.recorderNode = node;
                this.master!.connect(node);
            };
            start();
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
            // Detach worklet
            try {
                if (this.recorderNode) {
                    this.master?.disconnect(this.recorderNode);
                    this.recorderNode.port.postMessage({ type: 'enable', value: false });
                    this.recorderNode.disconnect();
                }
            } catch {}
            this.recorderNode = undefined;
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

    private makeImpulseResponse(sampleRate: number, seconds: number) {
        const len = Math.floor(sampleRate * seconds);
        const ir = this.ctx!.createBuffer(2, len, sampleRate);
        for (let ch = 0; ch < 2; ch++) {
            const d = ir.getChannelData(ch);
            for (let i = 0; i < len; i++) {
                const t = i / len;
                d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3);
            }
        }
        return ir;
    }

    private lerp(a: number, b: number, t: number) {
        return a + (b - a) * t;
    }

    private triggerFilterEnv(now: number, velScale: number) {
        if (!this.filter) return;
        const base = this.filterCutoff;
        const { attack, decay, sustain, amountHz } = this.fenv;
        if (amountHz <= 0) return;
        const peak = Math.max(20, Math.min(20000, base + amountHz * velScale));
        const sus = Math.max(20, Math.min(20000, base + amountHz * sustain * velScale));
        const p = this.filter.frequency;
        p.cancelScheduledValues(now);
        p.setValueAtTime(base, now);
        p.linearRampToValueAtTime(peak, now + Math.max(0.001, attack));
        p.linearRampToValueAtTime(sus, now + Math.max(0.001, attack) + Math.max(0.001, decay));
    }

    private triggerFilterEnvForNote(now: number, velScale: number, freq: number) {
        if (!this.filter) return;
        const base = this.computeKeytrackedCutoff(freq);
        const { attack, decay, sustain, amountHz } = this.fenv;
        if (amountHz <= 0) return;
        const peak = Math.max(20, Math.min(20000, base + amountHz * velScale));
        const sus = Math.max(20, Math.min(20000, base + amountHz * sustain * velScale));
        const p = this.filter.frequency;
        p.cancelScheduledValues(now);
        p.setValueAtTime(base, now);
        p.linearRampToValueAtTime(peak, now + Math.max(0.001, attack));
        p.linearRampToValueAtTime(sus, now + Math.max(0.001, attack) + Math.max(0.001, decay));
    }

    private triggerFilterEnvOn(param: AudioParam, now: number, velScale: number, base: number) {
        const { attack, decay, sustain, amountHz } = this.fenv;
        if (amountHz <= 0) return;
        const peak = Math.max(20, Math.min(20000, base + amountHz * velScale));
        const sus = Math.max(20, Math.min(20000, base + amountHz * sustain * velScale));
        param.cancelScheduledValues(now);
        param.setValueAtTime(base, now);
        param.linearRampToValueAtTime(peak, now + Math.max(0.001, attack));
        param.linearRampToValueAtTime(sus, now + Math.max(0.001, attack) + Math.max(0.001, decay));
    }

    private releaseFilterEnvOn(param: AudioParam, now: number, base: number) {
        const { release } = this.fenv;
        const current = param.value;
        param.cancelScheduledValues(now);
        param.setValueAtTime(current, now);
        param.linearRampToValueAtTime(base, now + Math.max(0.001, release));
    }

    private releaseFilterEnv(now: number) {
        if (!this.filter) return;
        const base = this.filterCutoff;
        const { release } = this.fenv;
        const p = this.filter.frequency;
        const current = p.value;
        p.cancelScheduledValues(now);
        p.setValueAtTime(current, now);
        p.linearRampToValueAtTime(base, now + Math.max(0.001, release));
    }

    private computeKeytrackedCutoff(freq: number) {
        const semis = Math.log2(freq / 440) * 12;
        const factor = Math.pow(2, (this.filtKeytrack * semis) / 12);
        return Math.max(20, Math.min(20000, this.filterCutoff * factor));
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
        // Recompute for running voices based on each voice frequency
        if (this.currentWave === "custom") {
            const sr = this.ctx.sampleRate;
            if (this.osc && this.voices.has("drone")) {
                const f = this.voices.get("drone")?.freq || this.currentFreq;
                const { real, imag } = this.buildPeriodicForFreq(s, f, sr);
                try { this.osc.setPeriodicWave(this.ctx.createPeriodicWave(real, imag, { disableNormalization: false })); }
                catch { this.osc.setPeriodicWave(this.ctx.createPeriodicWave(real, imag)); }
            }
            this.voices.forEach((v, key) => {
                if (key === "drone") return;
                if (v.kind !== "synth") return;
                const f = v.freq || this.currentFreq;
                const { real, imag } = this.buildPeriodicForFreq(s, f, sr);
                v.oscs.forEach((o) => {
                    try { o.setPeriodicWave(this.ctx!.createPeriodicWave(real, imag, { disableNormalization: false })); }
                    catch { o.setPeriodicWave(this.ctx!.createPeriodicWave(real, imag)); }
                });
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

    private buildPeriodicForFreq(samples: Float32Array, freq: number, sampleRate: number) {
        const nyquist = sampleRate / 2;
        const maxH = Math.max(1, Math.floor(nyquist / Math.max(1, freq)));
        return this.buildPeriodicFromSamples(samples, Math.min(64, maxH));
    }

    private startNoiseSrc() {
        if (!this.ctx || !this.noiseGain) return;
        try { if (this.noiseSrc) { this.noiseSrc.stop(); this.noiseSrc.disconnect(); } } catch {}
        const noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
        const data = noiseBuf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        this.noiseSrc = this.ctx.createBufferSource();
        this.noiseSrc.buffer = noiseBuf;
        this.noiseSrc.loop = true;
        this.noiseSrc.connect(this.noiseGain);
        this.noiseSrc.start();
    }
}
