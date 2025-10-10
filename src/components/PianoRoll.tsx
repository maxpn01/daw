"use client";
import { useMemo } from "react";

export type NoteEvent = {
    id: string;
    pitch: number; // MIDI note
    start: number; // step index
    duration: number; // steps
};

export default function PianoRoll({
    steps,
    startMidi,
    endMidi,
    notes,
    onChange,
    playheadStep,
    defaultLenSteps = 1,
    onAuditionKey,
}: {
    steps: number;
    startMidi: number;
    endMidi: number; // inclusive upper bound is handled; rows generated from end-1 down to start
    notes: NoteEvent[];
    onChange: (notes: NoteEvent[]) => void;
    playheadStep: number | null;
    defaultLenSteps?: number;
    onAuditionKey?: (midi: number, down: boolean) => void;
}) {
    const rows = useMemo(() => {
        const out: number[] = [];
        for (let m = endMidi - 1; m >= startMidi; m--) out.push(m);
        return out;
    }, [startMidi, endMidi]);

    // click to add/remove note starting at step
    const toggleNote = (pitch: number, start: number) => {
        const idx = notes.findIndex((n) => n.pitch === pitch && n.start === start);
        if (idx >= 0) {
            const next = notes.slice();
            next.splice(idx, 1);
            onChange(next);
        } else {
            const id = `${pitch}:${start}:${Math.random().toString(36).slice(2, 7)}`;
            onChange([...notes, { id, pitch, start, duration: Math.max(1, defaultLenSteps) }]);
        }
    };

    const noteForCell = (pitch: number, col: number) => notes.find((n) => n.pitch === pitch && n.start === col);
    const notesByPitch = useMemo(() => {
        const map = new Map<number, NoteEvent[]>();
        for (const n of notes) {
            if (!map.has(n.pitch)) map.set(n.pitch, []);
            map.get(n.pitch)!.push(n);
        }
        for (const arr of map.values()) arr.sort((a, b) => a.start - b.start);
        return map;
    }, [notes]);

    return (
        <div className="border rounded-xl overflow-hidden">
            {/* Header timeline */}
            <div className="grid" style={{ gridTemplateColumns: `80px repeat(${steps}, minmax(32px, 1fr))` }}>
                <div className="bg-black/20 border-b px-2 py-1 text-xs opacity-70">Keys</div>
                {Array.from({ length: steps }).map((_, i) => (
                    <div
                        key={i}
                        className={`border-b text-[10px] text-center py-1 ${i % 4 === 0 ? "bg-white/5" : "bg-transparent"}`}>
                        {i % 4 === 0 ? i / 4 + 1 : ""}
                    </div>
                ))}
            </div>

            {/* Grid rows */}
            <div className="max-h-[60vh] overflow-auto">
                {rows.map((midi) => (
                    <Row
                        key={midi}
                        midi={midi}
                        steps={steps}
                        notes={notesByPitch.get(midi) || []}
                        onCellClick={(col) => toggleNote(midi, col)}
                        playhead={playheadStep}
                        onAudition={onAuditionKey}
                    />
                ))}
            </div>
        </div>
    );
}

function Row({
    midi,
    steps,
    notes,
    onCellClick,
    playhead,
    onAudition,
}: {
    midi: number;
    steps: number;
    notes: NoteEvent[];
    onCellClick: (col: number) => void;
    playhead: number | null;
    onAudition?: (midi: number, down: boolean) => void;
}) {
    const keyName = midiToName(midi);
    const black = isBlack(midi % 12);
    return (
        <div className="grid relative" style={{ gridTemplateColumns: `80px repeat(${steps}, minmax(32px, 1fr))` }}>
            {/* Key */}
            <button
                onMouseDown={() => onAudition?.(midi, true)}
                onMouseUp={() => onAudition?.(midi, false)}
                onMouseLeave={() => onAudition?.(midi, false)}
                className={`px-2 text-xs text-left ${black ? "bg-neutral-800" : "bg-neutral-700"}`}
                title={`${keyName} (${midi})`}>
                {keyName}
            </button>

            {/* Step cells */}
            {Array.from({ length: steps }).map((_, col) => {
                const leftBorder = col === 0 ? "border-l-0" : "border-l";
                return (
                    <div
                        key={col}
                        className={`h-6 border-t ${leftBorder} cursor-pointer transition-colors ${
                            col === steps - 1 ? "border-r" : ""
                        } ${
                            black ? "bg-black/25" : "bg-black/15"
                        } ${
                            col % 4 === 0 ? "bg-gradient-to-b from-white/5 to-transparent" : ""
                        } ${
                            playhead === col ? "bg-cyan-700/20" : ""
                        } active:bg-cyan-600/20 hover:bg-white/10`}
                        onClick={() => onCellClick(col)}
                    />
                );
            })}

            {/* Absolute overlay with same grid to avoid layout gaps; notes span columns */}
            <div
                className="pointer-events-none absolute inset-0 grid z-30"
                style={{ gridTemplateColumns: `80px repeat(${steps}, minmax(32px, 1fr))` }}>
                {/* empty cell to align with key column */}
                <div />
                {notes.map((n) => (
                    <div
                        key={n.id}
                        className="pointer-events-auto my-[2px] mx-[1px] rounded-sm bg-cyan-500/60 hover:bg-cyan-400/70 active:bg-cyan-300/80 border border-cyan-300/70 shadow-sm transition-colors"
                        style={{ gridColumn: `${n.start + 2} / span ${n.duration}` }}
                        title={`${midiToName(n.pitch)} len ${n.duration}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            onCellClick(n.start);
                        }}
                    />
                ))}
            </div>
        </div>
    );
}

function isBlack(pc: number) {
    return pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10;
}

function midiToName(m: number) {
    const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
    const name = names[m % 12];
    const oct = Math.floor(m / 12) - 1;
    return `${name}${oct}`;
}
