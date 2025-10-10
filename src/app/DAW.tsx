"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AudioEngine } from "@/lib/audio/AudioEngine";
import PianoRoll, { NoteEvent } from "@/components/PianoRoll";
import { useRouter } from "next/navigation";
import { GearIcon } from "@radix-ui/react-icons";

export default function DAW() {
    const router = useRouter();
    const engine = useMemo(() => new AudioEngine(), []);

    const [tempo, setTempo] = useState(120);
    const [isPlaying, setIsPlaying] = useState(false);
    const [playhead, setPlayhead] = useState<number | null>(null);
    const [notes, setNotes] = useState<NoteEvent[]>([]);
    const [noteLen, setNoteLen] = useState(1); // in steps

    // Grid config
    const steps = 32; // 2 bars of 16th notes
    const startMidi = 48; // C3
    const endMidi = 72; // C5 (exclusive upper bound handled inside PianoRoll)

    const timerRef = useRef<number | null>(null);
    const nextStepRef = useRef(0);

    useEffect(() => {
        return () => {
            if (timerRef.current) window.clearInterval(timerRef.current);
            engine.allNotesOff();
        };
    }, [engine]);

    const start = async () => {
        await engine.resume();
        engine.setMasterGain(0.5);
        setIsPlaying(true);
        setPlayhead(0);
        nextStepRef.current = 0;
        const stepMs = (60_000 / tempo) / 4; // 16th notes
        // simple step scheduler
        timerRef.current = window.setInterval(() => {
            const step = nextStepRef.current % steps;
            setPlayhead(step);
            // trigger any notes starting at this step
            const starts = notes.filter((n) => (n.start % steps) === step);
            const nowTag = Date.now().toString(36);
            for (const n of starts) {
                const id = `daw:${n.id}:${nowTag}`;
                engine.noteOn(n.pitch, 0.9, id);
                const offDelay = Math.max(1, n.duration) * stepMs;
                window.setTimeout(() => engine.noteOff(id), offDelay);
            }
            nextStepRef.current = (nextStepRef.current + 1) % steps;
        }, stepMs);
    };

    const stop = () => {
        setIsPlaying(false);
        setPlayhead(null);
        if (timerRef.current) window.clearInterval(timerRef.current);
        timerRef.current = null;
        engine.allNotesOff();
    };

    // If tempo changes during playback, restart clock to apply new step time
    useEffect(() => {
        if (!isPlaying) return;
        if (timerRef.current) window.clearInterval(timerRef.current);
        const stepMs = (60_000 / tempo) / 4;
        timerRef.current = window.setInterval(() => {
            const step = nextStepRef.current % steps;
            setPlayhead(step);
            const starts = notes.filter((n) => (n.start % steps) === step);
            const nowTag = Date.now().toString(36);
            for (const n of starts) {
                const id = `daw:${n.id}:${nowTag}`;
                engine.noteOn(n.pitch, 0.9, id);
                const offDelay = Math.max(1, n.duration) * stepMs;
                window.setTimeout(() => engine.noteOff(id), offDelay);
            }
            nextStepRef.current = (nextStepRef.current + 1) % steps;
        }, stepMs);
        return () => {
            if (timerRef.current) window.clearInterval(timerRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tempo]);

    return (
        <main className="p-4 sm:p-6 max-w-6xl mx-auto grid gap-4">
            <header className="flex items-center justify-between relative z-20">
                <h1 className="text-xl font-semibold">Open DAW (alpha)</h1>
                {/* Settings / plugins */}
                <PluginMenu onOpenSynth={() => router.push("/synth")} />
            </header>

            {/* Transport */}
            <div className="flex items-center gap-3 flex-wrap">
                {!isPlaying ? (
                    <button onClick={start} className="px-3 py-1.5 rounded border hover:opacity-80">Play</button>
                ) : (
                    <button onClick={stop} className="px-3 py-1.5 rounded border hover:opacity-80">Stop</button>
                )}
                <div className="flex items-center gap-2">
                    <label className="text-sm opacity-80">Tempo</label>
                    <input
                        type="number"
                        min={40}
                        max={240}
                        value={tempo}
                        onChange={(e) => setTempo(Math.max(40, Math.min(240, Number(e.target.value) || 120)))}
                        className="w-20 px-2 py-1 rounded border bg-transparent"
                    />
                    <input
                        type="range"
                        min={40}
                        max={240}
                        value={tempo}
                        onChange={(e) => setTempo(Number(e.target.value))}
                    />
                </div>
                <div className="flex items-center gap-2">
                    <label className="text-sm opacity-80">Note len</label>
                    <select
                        value={noteLen}
                        onChange={(e) => setNoteLen(Number(e.target.value))}
                        className="px-2 py-1 rounded border select-reset">
                        <option value={1}>1/16</option>
                        <option value={2}>1/8</option>
                        <option value={4}>1/4</option>
                        <option value={8}>1/2</option>
                        <option value={16}>1 bar</option>
                    </select>
                </div>
            </div>

            {/* Piano Roll */}
            <PianoRoll
                steps={steps}
                startMidi={startMidi}
                endMidi={endMidi}
                playheadStep={playhead}
                notes={notes}
                onChange={setNotes}
                defaultLenSteps={noteLen}
                onAuditionKey={(midi, down) => {
                    if (down) engine.noteOn(midi, 0.8, `aud:${midi}`);
                    else engine.noteOff(`aud:${midi}`);
                }}
            />
        </main>
    );
}

function PluginMenu({ onOpenSynth }: { onOpenSynth: () => void }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="relative">
            <button
                aria-label="Settings"
                onClick={() => setOpen((v) => !v)}
                className="p-2 rounded-full border hover:opacity-80"
                title="Plugins / Settings">
                <GearIcon className="w-5 h-5 opacity-80" />
            </button>
            {open && (
                <div className="absolute right-0 mt-2 w-60 border rounded-xl bg-background/90 backdrop-blur p-3 grid gap-2 z-50 shadow-xl">
                    <div className="text-sm opacity-80">Installed Plugins</div>
                    <button onClick={onOpenSynth} className="text-left px-3 py-2 rounded border hover:opacity-80">
                        Synth Lab
                    </button>
                </div>
            )}
        </div>
    );
}
