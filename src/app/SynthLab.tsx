"use client";

import { useEffect, useMemo, useState } from "react";
import { AudioEngine, Wave } from "@/lib/audio/AudioEngine";
import { Visualizer } from "@/components/Visualizer";
import Knob from "@/components/Knob";

export default function SynthLab() {
  const engine = useMemo(() => new AudioEngine(), []);

  const [ready, setReady] = useState(false);
  const [running, setRunning] = useState(false);

  // synth params
  const [wave, setWave] = useState<Wave>("sine");
  const [freq, setFreq] = useState(220);
  const [vol, setVol] = useState(0.5);
  const [cutoff, setCutoff] = useState(1200);
  const [q, setQ] = useState(0.8);
  const [dist, setDist] = useState(0);
  const [attack, setAttack] = useState(0.01);
  const [decay, setDecay] = useState(0.1);
  const [sustain, setSustain] = useState(0.8);
  const [release, setRelease] = useState(0.2);

  // recording
  const [recActive, setRecActive] = useState(false);
  const [recFmt, setRecFmt] = useState<"wav" | "mp3">("wav");
  const [recInfo, setRecInfo] = useState<string>("");

  useEffect(() => {
    // Keep engine in sync when params change
    engine.setWave(wave);
  }, [wave, engine]);

  useEffect(() => {
    engine.setFrequency(freq);
  }, [freq, engine]);

  useEffect(() => {
    engine.setMasterGain(vol);
  }, [vol, engine]);

  useEffect(() => {
    engine.setFilterCutoff(cutoff);
  }, [cutoff, engine]);

  useEffect(() => {
    engine.setFilterQ(q);
  }, [q, engine]);

  useEffect(() => {
    engine.setDistortion(dist);
  }, [dist, engine]);

  useEffect(() => {
    engine.setADSR(attack, decay, sustain, release);
  }, [attack, decay, sustain, release, engine]);

  const toggleTone = async () => {
    await engine.resume();
    setReady(true);
    if (running) {
      engine.stopTestTone();
      setRunning(false);
    } else {
      engine.startTestTone(freq, wave);
      setRunning(true);
    }
  };

  const startRec = async () => {
    await engine.resume();
    setReady(true);
    const { mode, mimeType } = engine.startRecording(recFmt);
    setRecActive(true);
    setRecInfo(`${mode.toUpperCase()} (${mimeType})`);
  };

  const stopRec = async () => {
    const blob = await engine.stopRecording();
    setRecActive(false);
    const url = URL.createObjectURL(blob);
    const ext = blob.type.includes("mpeg") ? "mp3" : blob.type.includes("wav") ? "wav" : blob.type.includes("webm") ? "webm" : "audio";
    const a = document.createElement("a");
    a.href = url;
    a.download = `synth-lab-${new Date().toISOString().replace(/[:.]/g, "-")}.${ext}`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 1000);
  };

  return (
    <main className="p-6 max-w-4xl mx-auto grid gap-4">
      <h1 className="text-xl font-semibold">Synth Lab</h1>
      <Visualizer analyser={ready ? engine.analyser! : undefined} />

      {/* Transport */}
      <div className="flex items-center gap-2">
        <button onClick={toggleTone} className="px-4 py-2 rounded-xl border hover:opacity-80 cursor-pointer">
          {running ? "Stop" : "Start"} test tone
        </button>
        <div className="text-xs opacity-70">{ready ? "Audio ready" : "Click Start to init audio"}</div>
      </div>

      {/* Waveform select */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm opacity-80">Wave:</span>
        {["sine", "square", "sawtooth", "triangle"].map((w) => (
          <button
            key={w}
            onClick={() => setWave(w as Wave)}
            className={`px-3 py-1 rounded-full border text-sm ${wave === w ? "bg-cyan-600/20 border-cyan-400" : "hover:opacity-80"}`}
          >
            {w}
          </button>
        ))}
      </div>

      {/* Knobs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
        <Knob label="Freq" value={freq} onChange={setFreq} min={55} max={1760} step={1} format={(v) => `${Math.round(v)} Hz`} />
        <Knob label="Volume" value={vol} onChange={setVol} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} />
        <Knob label="Cutoff" value={cutoff} onChange={setCutoff} min={50} max={20000} step={10} format={(v) => `${Math.round(v)} Hz`} />
        <Knob label="Resonance" value={q} onChange={setQ} min={0.1} max={20} step={0.1} />
        <Knob label="Drive" value={dist} onChange={setDist} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} />
        <div className="hidden md:block" />
        <Knob label="Attack" value={attack} onChange={setAttack} min={0} max={2} step={0.01} format={(v) => `${v.toFixed(2)}s`} />
        <Knob label="Decay" value={decay} onChange={setDecay} min={0} max={2} step={0.01} format={(v) => `${v.toFixed(2)}s`} />
        <Knob label="Sustain" value={sustain} onChange={setSustain} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} />
        <Knob label="Release" value={release} onChange={setRelease} min={0} max={3} step={0.01} format={(v) => `${v.toFixed(2)}s`} />
      </div>

      {/* Recording */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm opacity-80">Export as</label>
          <select value={recFmt} onChange={(e) => setRecFmt(e.target.value as any)} className="border rounded px-2 py-1 text-sm bg-transparent">
            <option value="wav">WAV</option>
            <option value="mp3">MP3 (fallback to WebM if unsupported)</option>
          </select>
        </div>
        {!recActive ? (
          <button onClick={startRec} className="px-3 py-1.5 rounded border hover:opacity-80">Start recording</button>
        ) : (
          <button onClick={stopRec} className="px-3 py-1.5 rounded border border-red-400 text-red-200 hover:opacity-80">Stop & download</button>
        )}
        {!!recInfo && <span className="text-xs opacity-70">Mode: {recInfo}</span>}
      </div>

      <p className="text-xs opacity-60">
        Tip: tweak knobs while recording to capture changes. WAV records raw PCM in-browser. MP3 depends on browser support and may fall back to WebM/Opus.
      </p>
    </main>
  );
}
