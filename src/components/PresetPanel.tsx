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
    customShape?: number[];
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
    const [status, setStatus] = useState<string>("");
    const [importing, setImporting] = useState(false);

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
        setStatus(`Saved ${key}`);
    };

    const load = () => {
        if (!selected) return;
        const p = list[selected];
        if (p) {
            applyPreset(p);
            setStatus(`Loaded ${selected}`);
        }
    };

    const del = () => {
        if (!selected) return;
        const ok = window.confirm(`Delete preset "${selected}"?`);
        if (!ok) return;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { [selected]: _, ...rest } = list;
        saveList(rest);
        setStatus(`Deleted ${selected}`);
        setSelected("");
    };

    const download = (data: string | Blob, filename: string) => {
        const blob = typeof data === "string" ? new Blob([data], { type: "application/json" }) : data;
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
    };

    const sanitize = (s: string) => (s || "preset").replace(/[^a-z0-9_\-]+/gi, "-");

    const exportCurrent = () => {
        const p = getPreset();
        const fname = sanitize(p.name || name) + ".json";
        download(JSON.stringify(p, null, 2), fname);
        setStatus(`Downloaded ${fname}`);
    };

    const exportSelected = () => {
        if (!selected) {
            setStatus("Select a saved preset to export");
            return;
        }
        const p = list[selected];
        if (!p) {
            setStatus("Selected preset not found");
            return;
        }
        const fname = sanitize(p.name || selected) + ".json";
        download(JSON.stringify(p, null, 2), fname);
        setStatus(`Downloaded ${fname}`);
    };

    const exportAll = () => {
        const payload = JSON.stringify(list, null, 2);
        const now = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
        download(payload, `presets-${now}.json`);
        setStatus("Downloaded all presets");
    };

    const onImportFiles = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        setImporting(true);
        setStatus("Importing...");
        try {
            const aggregate: Record<string, SynthPreset> = { ...list };
            let applied = false;
            let added = 0;
            for (const file of Array.from(files)) {
                const text = await file.text();
                const data = JSON.parse(text);
                if (Array.isArray(data)) {
                    data.forEach((p: any) => {
                        const key = (p?.name as string) || `Imported ${Object.keys(aggregate).length + 1}`;
                        aggregate[key] = { ...(p as SynthPreset), name: key };
                        added++;
                    });
                } else if (
                    data &&
                    typeof data === "object" &&
                    !Array.isArray(data) &&
                    !("wave" in data) &&
                    !("adsr" in data)
                ) {
                    Object.entries(data as Record<string, SynthPreset>).forEach(([k, v]) => {
                        const key = k || `Imported ${Object.keys(aggregate).length + 1}`;
                        aggregate[key] = { ...v, name: v.name || key };
                        added++;
                    });
                } else {
                    const p = data as SynthPreset;
                    const key = p.name || `Imported ${Object.keys(aggregate).length + 1}`;
                    aggregate[key] = { ...p, name: key };
                    applyPreset(p);
                    setSelected(key);
                    applied = true;
                    added++;
                }
            }
            saveList(aggregate);
            setStatus(`Imported ${added} preset(s)${applied ? " and applied one" : ""}`);
        } catch (e: any) {
            setStatus("Import failed: " + (e?.message || "invalid JSON"));
        } finally {
            setImporting(false);
        }
    };

    return (
        <div className="grid gap-3 border rounded-md p-3">
            <div className="text-sm font-medium">Presets</div>
            <div className="grid sm:grid-cols-2 gap-3 items-center">
                <div className="grid grid-cols-3 gap-2 items-center">
                    <input
                        className="border rounded px-2 bg-transparent col-span-2 text-sm h-9"
                        placeholder="Preset name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        aria-label="Preset name"
                    />
                    <button
                        type="button"
                        className="px-3 py-1.5 rounded border hover:opacity-80 text-sm"
                        onClick={save}
                        title="Save current settings as a preset">
                        Save
                    </button>
                </div>
                <div className="grid grid-cols-4 gap-2 items-center">
                    <div className="relative col-span-3">
                        <select
                            className="w-full border rounded px-2 pr-10 py-1.5 text-sm select-reset"
                            value={selected}
                            onChange={(e) => setSelected(e.target.value)}
                            aria-label="Saved presets">
                            <option value="">-- Select saved --</option>
                            {Object.keys(list).map((k) => (
                                <option key={k} value={k}>
                                    {k}
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
                    <button
                        type="button"
                        className="px-3 py-1.5 rounded border hover:opacity-80 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={load}
                        disabled={!selected}
                        title={selected ? `Load "${selected}"` : "Select a preset to load"}>
                        Load
                    </button>
                </div>
                <div className="flex gap-2 items-center flex-wrap sm:col-span-2">
                    <button
                        type="button"
                        className="px-3 py-1.5 rounded border hover:opacity-80 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={del}
                        disabled={!selected}
                        title={selected ? `Delete "${selected}"` : "Select a preset to delete"}>
                        Delete
                    </button>
                    <button
                        type="button"
                        className="px-3 py-1.5 rounded border hover:opacity-80 text-sm"
                        onClick={exportCurrent}
                        title="Download current preset as JSON">
                        Export Current
                    </button>
                    <button
                        type="button"
                        className="px-3 py-1.5 rounded border hover:opacity-80 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={exportSelected}
                        disabled={!selected}
                        title={selected ? `Download "${selected}" as JSON` : "Select a preset to export"}>
                        Export Selected
                    </button>
                    <button
                        type="button"
                        className="px-3 py-1.5 rounded border hover:opacity-80 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={exportAll}
                        disabled={Object.keys(list).length === 0}
                        title={
                            Object.keys(list).length ? "Download all saved presets as JSON" : "No presets to export"
                        }>
                        Export All
                    </button>
                    <label
                        className={`px-3 py-1.5 rounded border hover:opacity-80 text-sm text-center cursor-pointer ${
                            importing ? "opacity-50 cursor-not-allowed pointer-events-none" : ""
                        }`}
                        title="Import preset(s) from .json">
                        {importing ? "Importing..." : "Import"}
                        <input
                            type="file"
                            accept="application/json,.json"
                            multiple
                            className="hidden"
                            onChange={(e) => {
                                const input = e.currentTarget;
                                // Kick off import, then reset value so selecting the same file again re-triggers onChange
                                void onImportFiles(input.files);
                                input.value = "";
                            }}
                            aria-label="Import presets from JSON"
                            disabled={importing}
                        />
                    </label>
                </div>
                {!!status && <div className="sm:col-span-2 text-xs opacity-70">{status}</div>}
            </div>
        </div>
    );
}
