/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Props = {
    baseNote?: number; // MIDI number for leftmost white key; default 48 (C3)
    octaves?: number; // number of octaves to render
    onNoteOn: (note: number, velocity?: number, id?: number | string) => void;
    onNoteOff: (id: number | string) => void;
};

export default function Keyboard({ baseNote = 48, octaves = 2, onNoteOn, onNoteOff }: Props) {
    const whiteOffsets = [0, 2, 4, 5, 7, 9, 11];
    const blackMap = new Set([1, 3, 6, 8, 10]);
    const notes = useMemo(() => {
        const arr: number[] = [];
        for (let o = 0; o < octaves; o++) {
            for (let i = 0; i < 12; i++) arr.push(baseNote + o * 12 + i);
        }
        return arr;
    }, [baseNote, octaves]);
    const [down, setDown] = useState<Set<number>>(new Set());
    const pressed = useRef(new Set<number>());

    const handleDown = useCallback(
        (note: number) => {
            if (pressed.current.has(note)) return;
            pressed.current.add(note);
            setDown(new Set(pressed.current));
            onNoteOn(note, 1, note);
        },
        [onNoteOn]
    );
    const handleUp = useCallback(
        (note: number) => {
            if (!pressed.current.has(note)) return;
            pressed.current.delete(note);
            setDown(new Set(pressed.current));
            onNoteOff(note);
        },
        [onNoteOff]
    );

    // QWERTY mapping (Z row = C3, Q row = C4)
    useEffect(() => {
        const map: Record<string, number> = {
            // lower row
            z: 48,
            s: 49,
            x: 50,
            d: 51,
            c: 52,
            v: 53,
            g: 54,
            b: 55,
            h: 56,
            n: 57,
            j: 58,
            m: 59,
            // upper row
            q: 60,
            "2": 61,
            w: 62,
            "3": 63,
            e: 64,
            r: 65,
            "5": 66,
            t: 67,
            "6": 68,
            y: 69,
            "7": 70,
            u: 71,
        };
        const downHandler = (e: KeyboardEvent) => {
            if (e.repeat) return;
            const key = e.key.toLowerCase();
            if (!(key in map)) return;
            const note = map[key];
            handleDown(note);
        };
        const upHandler = (e: KeyboardEvent) => {
            const key = e.key.toLowerCase();
            const mapAny = map as any;
            if (!(key in mapAny)) return;
            const note = mapAny[key];
            handleUp(note);
        };
        window.addEventListener("keydown", downHandler);
        window.addEventListener("keyup", upHandler);
        return () => {
            window.removeEventListener("keydown", downHandler);
            window.removeEventListener("keyup", upHandler);
        };
    }, [handleDown, handleUp]);

    // Render white keys and overlay black keys with absolute positioning
    const whiteNotes = notes.filter((n) => !blackMap.has((n - baseNote) % 12));
    return (
        <div className="relative select-none" style={{ height: 120 }}>
            <div className="flex" style={{ height: 120 }}>
                {whiteNotes.map((n) => (
                    <div
                        key={n}
                        onPointerDown={() => handleDown(n)}
                        onPointerUp={() => handleUp(n)}
                        onPointerLeave={() => handleUp(n)}
                        className={`flex-1 border bg-white/90 ${down.has(n) ? "bg-cyan-300" : ""}`}
                        style={{ height: 120 }}
                    />
                ))}
            </div>
            {/* black keys */}
            <div className="absolute inset-0 pointer-events-none" style={{ height: 120 }}>
                <div className="flex h-full">
                    {notes.map((n, idx) => {
                        const pitch = (n - baseNote) % 12;
                        if (!blackMap.has(pitch)) return <div key={n} className="flex-1" />;
                        // Position black keys: they sit between whites; we emulate by half-width overlay
                        return (
                            <div key={n} className="flex-1 relative">
                                <div
                                    className={`absolute left-1/2 -translate-x-1/2 w-1/2 h-2/3 border bg-black text-white pointer-events-auto ${
                                        down.has(n) ? "bg-cyan-700" : ""
                                    }`}
                                    onPointerDown={() => handleDown(n)}
                                    onPointerUp={() => handleUp(n)}
                                    onPointerLeave={() => handleUp(n)}
                                />
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
