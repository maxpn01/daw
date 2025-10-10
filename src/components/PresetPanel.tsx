"use client";
import { useEffect, useMemo, useState } from "react";

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

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setList(JSON.parse(raw));
    } catch {}
  }, []);

  const saveList = (next: Record<string, SynthPreset>) => {
    setList(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
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
    const { [selected]: _, ...rest } = list;
    saveList(rest);
    setSelected("");
  };

  const copy = async () => {
    const p = getPreset();
    try { await navigator.clipboard.writeText(JSON.stringify(p)); } catch {}
  };

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const p = JSON.parse(text) as SynthPreset;
      applyPreset(p);
    } catch {}
  };

  return (
    <div className="grid gap-2 border rounded-md p-3">
      <div className="text-sm font-medium">Presets</div>
      <div className="grid sm:grid-cols-2 gap-2 items-center">
        <div className="grid grid-cols-3 gap-2 items-center">
          <input className="border rounded px-2 py-1 bg-transparent col-span-2" placeholder="Preset name" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="px-2 py-1 border rounded" onClick={save}>Save</button>
        </div>
        <div className="grid grid-cols-4 gap-2 items-center">
          <select className="border rounded px-2 py-1 bg-transparent col-span-3" value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">-- Select saved --</option>
            {Object.keys(list).map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
          <button className="px-2 py-1 border rounded" onClick={load}>Load</button>
        </div>
        <div className="grid grid-cols-3 gap-2 items-center">
          <button className="px-2 py-1 border rounded" onClick={del}>Delete</button>
          <button className="px-2 py-1 border rounded" onClick={copy}>Copy JSON</button>
          <button className="px-2 py-1 border rounded" onClick={paste}>Paste JSON</button>
        </div>
      </div>
    </div>
  );
}

