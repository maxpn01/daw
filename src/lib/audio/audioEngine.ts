import { useCallback, useEffect, useRef } from "react";

type NoteOptions = {
    duration?: number;
    velocity?: number;
    type?: OscillatorType;
};

export type PlayNote = (midi: number, options?: NoteOptions) => Promise<void>;

const midiToFrequency = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

export class AudioEngine {
    private audioContext: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    private readonly defaultOptions: Required<NoteOptions> = {
        duration: 0.7,
        velocity: 0.35,
        type: "triangle",
    };

    private getAudioContext() {
        if (typeof window === "undefined") return null;
        if (!this.audioContext) {
            const AudioContextImpl = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextImpl) return null;
            this.audioContext = new AudioContextImpl();
        }
        return this.audioContext;
    }

    private getMasterGain(context: AudioContext) {
        if (!this.masterGain) {
            this.masterGain = context.createGain();
            this.masterGain.gain.value = 0.9;
            this.masterGain.connect(context.destination);
        }
        return this.masterGain;
    }

    async resume() {
        const context = this.getAudioContext();
        if (!context) return null;
        if (context.state === "suspended") {
            await context.resume();
        }
        return context;
    }

    async playNote(midi: number, options?: NoteOptions) {
        const context = await this.resume();
        if (!context) return;

        const { duration, velocity, type } = { ...this.defaultOptions, ...options };
        const oscillator = context.createOscillator();
        oscillator.type = type;
        oscillator.frequency.value = midiToFrequency(midi);

        const gain = context.createGain();
        const now = context.currentTime;
        const attack = 0.01;
        const decay = 0.06;
        const release = 0.12;
        const minDuration = attack + decay + release;
        const noteDuration = Math.max(duration, minDuration);
        const endTime = now + noteDuration;
        const sustain = velocity * 0.7;
        const sustainTime = Math.max(now + attack + decay, endTime - release);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(velocity, now + attack);
        gain.gain.linearRampToValueAtTime(sustain, now + attack + decay);
        gain.gain.setValueAtTime(sustain, sustainTime);
        gain.gain.linearRampToValueAtTime(0, endTime);

        oscillator.connect(gain);
        gain.connect(this.getMasterGain(context));

        oscillator.start(now);
        oscillator.stop(endTime + 0.05);
    }

    dispose() {
        if (this.masterGain) {
            this.masterGain.disconnect();
            this.masterGain = null;
        }
        if (this.audioContext) {
            void this.audioContext.close();
            this.audioContext = null;
        }
    }
}

export function useAudioEngine() {
    const engineRef = useRef<AudioEngine | null>(null);

    if (!engineRef.current) {
        engineRef.current = new AudioEngine();
    }

    const playNote = useCallback<PlayNote>(
        (midi, options) => engineRef.current?.playNote(midi, options) ?? Promise.resolve(),
        []
    );
    const resume = useCallback(() => engineRef.current?.resume() ?? Promise.resolve(null), []);

    useEffect(() => {
        const engine = engineRef.current;
        return () => {
            engine?.dispose();
        };
    }, []);

    return { playNote, resume };
}
