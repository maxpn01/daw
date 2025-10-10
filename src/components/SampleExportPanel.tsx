/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useCallback, useMemo, useState } from "react";
import { AudioEngine } from "@/lib/audio/AudioEngine";

type Props = {
    engine: AudioEngine;
};

export default function SampleExportPanel({ engine }: Props) {
    const [from, setFrom] = useState("C3");
    const [to, setTo] = useState("C5");
    const [seconds, setSeconds] = useState(2);
    const [name, setName] = useState("synth-lab");
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState<string>("");

    const options = useMemo(() => noteNames(), []);

    const doExport = useCallback(async () => {
        setBusy(true);
        setStatus("Preparing...");
        try {
            const start = parseNote(from);
            const end = parseNote(to);
            if (end < start) throw new Error("Range invalid");
            for (let note = start; note <= end; note++) {
                setStatus(`Rendering ${noteName(note)}...`);
                const blob = await engine.renderNoteToWav(note, seconds);
                const fileName = `${name}_${noteName(note)}.wav`;
                downloadBlob(blob, fileName);
            }
            // Generate basic SFZ mapping
            const lines = ["<group>"];
            for (let note = start; note <= end; note++) {
                const fname = `${name}_${noteName(note)}.wav`;
                lines.push(`<region sample=${fname} lokey=${note} hikey=${note} pitch_keycenter=${note} />`);
            }
            const sfz = new Blob([lines.join("\n") + "\n"], { type: "text/plain" });
            downloadBlob(sfz, `${name}.sfz`);
            setStatus("Done. WAVs and SFZ downloaded.");
        } catch (e: any) {
            setStatus(e?.message || String(e));
        } finally {
            setBusy(false);
        }
    }, [engine, from, to, seconds, name]);

    return (
        <div className="grid gap-2 border rounded-md p-3">
            <div className="text-sm font-medium">Export Sample Pack</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-center">
                <label className="text-sm opacity-80">From</label>
                <div className="relative">
                    <select
                        className="w-full border rounded px-2 pr-10 py-1.5 text-sm select-reset"
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}>
                        {options.map((n) => (
                            <option key={n} value={n}>
                                {n}
                            </option>
                        ))}
                    </select>
                    <svg
                        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 opacity-70"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        aria-hidden="true">
                        <path d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z" />
                    </svg>
                </div>
                <label className="text-sm opacity-80">To</label>
                <div className="relative">
                    <select
                        className="w-full border rounded px-2 pr-10 py-1.5 text-sm select-reset"
                        value={to}
                        onChange={(e) => setTo(e.target.value)}>
                        {options.map((n) => (
                            <option key={n} value={n}>
                                {n}
                            </option>
                        ))}
                    </select>
                    <svg
                        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 opacity-70"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        aria-hidden="true">
                        <path d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z" />
                    </svg>
                </div>
                <label className="text-sm opacity-80">Seconds</label>
                <input
                    className="border rounded px-2 py-1 bg-transparent"
                    type="number"
                    min={0.2}
                    max={10}
                    step={0.1}
                    value={seconds}
                    onChange={(e) => setSeconds(Number(e.target.value))}
                />
                <label className="text-sm opacity-80">Name</label>
                <input
                    className="border rounded px-2 py-1 bg-transparent"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                />
                <div className="col-span-2 sm:col-span-4">
                    <button disabled={busy} onClick={doExport} className="px-3 py-1.5 rounded border hover:opacity-80">
                        {busy ? "Exporting..." : "Export WAVs + SFZ"}
                    </button>
                </div>
                {!!status && <div className="col-span-2 sm:col-span-4 text-xs opacity-70">{status}</div>}
            </div>
            <div className="text-xs opacity-60">
                This renders one WAV per semitone in the selected range and downloads an SFZ mapping file you can load
                in most samplers. Drop all files into one folder in your DAW.
            </div>
        </div>
    );
}

function noteNames() {
    const arr: string[] = [];
    const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    for (let n = 24; n <= 84; n++) arr.push(`${names[n % 12]}${Math.floor(n / 12) - 1}`);
    return arr;
}
function parseNote(s: string) {
    const m = s.match(/^([A-Ga-g])(#?)(-?\d+)$/);
    if (!m) throw new Error("Invalid note: " + s);
    const base = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[(m[1] || "c").toLowerCase() as "c"];
    const sharp = m[2] ? 1 : 0;
    const octave = parseInt(m[3], 10);
    return (octave + 1) * 12 + base + sharp;
}
function noteName(n: number) {
    const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    return `${names[n % 12]}${Math.floor(n / 12) - 1}`;
}
function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
    }, 1000);
}
