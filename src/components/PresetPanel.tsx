/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useEffect, useState } from "react";

export type SynthPreset = {
    name: string;
    wave: string;
    freq: number;
    vol: number;
    cutoff: number;
    q: number;
    dist: number;
    adsr: { a: number; d: number; s: number; r: number };
    fenv: { a: number; d: number; s: number; r: number; amount: number };
    lfo: { rate: number; vibrato: number; filt: number; trem: number };
    noise: number;
    vel: { amp: number; filt: number };
    maxVoices: number;
    customShape?: number[]; // optional
    unison?: { count: number; detune: number; spread: number };
};

type Props = {
    getPreset: () => SynthPreset;
    applyPreset: (p: SynthPreset) => void;
};

const STORAGE_KEY = "synthlab-presets-v1";

export default function PresetPanel({ getPreset, applyPreset }: Props) {
    const [name, setName] = useState("");
    const [list, setList] = useState<Record<string, SynthPreset>>({});
    const [selected, setSelected] = useState<string>("");
    const [jsonText, setJsonText] = useState("");
    const [status, setStatus] = useState<string>("");
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) setList(JSON.parse(raw));
        } catch {}
    }, []);

    const saveList = (next: Record<string, SynthPreset>) => {
        setList(next);
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {}
    };

    const save = () => {
        const p = getPreset();
        const key = name || p.name || `Preset ${Object.keys(list).length + 1}`;
        p.name = key;
        const next = { ...list, [key]: p };
        saveList(next);
        setSelected(key);
    };

    const load = () => {
        if (!selected) return;
        const p = list[selected];
        if (p) applyPreset(p);
    };

    const del = () => {
        if (!selected) return;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { [selected]: _, ...rest } = list;
        saveList(rest);
        setSelected("");
    };

    const copy = async () => {
        const text = JSON.stringify(getPreset());
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setStatus("Copied to clipboard");
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // Fallback
            try {
                const ta = document.createElement("textarea");
                ta.value = text;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand("copy");
                ta.remove();
                setCopied(true);
                setStatus("Copied to clipboard");
                setTimeout(() => setCopied(false), 1500);
            } catch {
                setStatus("Copy failed. Select and copy manually.");
                setJsonText(text);
            }
        }
    };

    const applyFromText = () => {
        try {
            const p = JSON.parse(jsonText) as SynthPreset;
            applyPreset(p);
            setStatus("JSON applied");
        } catch (e: any) {
            setStatus("Invalid JSON: " + (e?.message || "parse error"));
        }
    };

    return (
        <div className="grid gap-2 border rounded-md p-3">
            <div className="text-sm font-medium">Presets</div>
            <div className="grid sm:grid-cols-2 gap-2 items-center">
                <div className="grid grid-cols-3 gap-2 items-center">
                    <input
                        className="border rounded px-2 py-1 bg-transparent col-span-2"
                        placeholder="Preset name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                    />
                    <button className="px-2 py-1 border rounded" onClick={save}>
                        Save
                    </button>
                </div>
                <div className="grid grid-cols-4 gap-2 items-center">
                    <select
                        className="border rounded px-2 py-1 bg-transparent col-span-3"
                        value={selected}
                        onChange={(e) => setSelected(e.target.value)}>
                        <option value="">-- Select saved --</option>
                        {Object.keys(list).map((k) => (
                            <option key={k} value={k}>
                                {k}
                            </option>
                        ))}
                    </select>
                    <button className="px-2 py-1 border rounded" onClick={load}>
                        Load
                    </button>
                </div>
                <div className="grid grid-cols-5 gap-2 items-center">
                    <button className="px-2 py-1 border rounded" onClick={del}>
                        Delete
                    </button>
                    <div className="col-span-2 flex items-center gap-2">
                        <button className="px-2 py-1 border rounded" onClick={copy} title="Copy current preset as JSON">
                            Copy JSON
                        </button>
                        {copied && <span className="text-xs opacity-70">Copied!</span>}
                    </div>
                    {!!status && <div className="col-span-5 text-xs opacity-70">{status}</div>}
                </div>
            </div>
            {/* Manual JSON field */}
            <div className="grid gap-2">
                <label className="text-sm opacity-80">Preset JSON</label>
                <textarea
                    className="border rounded p-2 font-mono text-xs bg-transparent"
                    rows={6}
                    placeholder="Paste or edit preset JSON here"
                    value={jsonText}
                    onChange={(e) => setJsonText(e.target.value)}
                />
                <div className="flex gap-2">
                    <button className="px-2 py-1 border rounded" onClick={applyFromText}>
                        Apply JSON
                    </button>
                    <button
                        className="px-2 py-1 border rounded"
                        onClick={() => {
                            setJsonText("");
                            setStatus("");
                        }}>
                        Clear
                    </button>
                </div>
            </div>
        </div>
    );
}
