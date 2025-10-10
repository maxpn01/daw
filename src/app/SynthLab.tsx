/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from "react";
import { AudioEngine, Wave } from "@/lib/audio/AudioEngine";
import { Visualizer } from "@/components/Visualizer";
import Knob from "@/components/Knob";
import LogKnob from "@/components/LogKnob";
import PresetPanel, { SynthPreset } from "@/components/PresetPanel";
import WaveEditor from "@/components/WaveEditor";
import Keyboard from "@/components/Keyboard";
import SampleExportPanel from "@/components/SampleExportPanel";

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
    const [customShape, setCustomShape] = useState(() => makeSine(256));

    // LFO / noise
    const [lfoRate, setLfoRate] = useState(5);
    const [vibrato, setVibrato] = useState(0);
    const [filterLfo, setFilterLfo] = useState(0);
    const [tremolo, setTremolo] = useState(0);
    const [noise, setNoise] = useState(0);

    // Filter envelope + velocity sens + polyphony
    const [fAttack, setFAttack] = useState(0.005);
    const [fDecay, setFDecay] = useState(0.2);
    const [fSustain, setFSustain] = useState(0.0);
    const [fRelease, setFRelease] = useState(0.2);
    const [fAmount, setFAmount] = useState(0);
    const [velAmp, setVelAmp] = useState(1);
    const [velFilt, setVelFilt] = useState(0.5);
    const [maxVoices, setMaxVoices] = useState(16);

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

    useEffect(() => {
        // keep custom waveform in sync
        engine.setCustomWaveShape(customShape);
    }, [customShape, engine]);

    useEffect(() => {
        engine.setFilterEnv(fAttack, fDecay, fSustain, fRelease, fAmount);
    }, [engine, fAttack, fDecay, fSustain, fRelease, fAmount]);
    useEffect(() => { engine.setAmpVelocitySensitivity(velAmp); }, [engine, velAmp]);
    useEffect(() => { engine.setFilterVelocitySensitivity(velFilt); }, [engine, velFilt]);
    useEffect(() => { engine.setMaxVoices(maxVoices); }, [engine, maxVoices]);

    useEffect(() => {
        engine.setLfoRate(lfoRate);
    }, [lfoRate, engine]);
    useEffect(() => {
        engine.setVibratoCents(vibrato);
    }, [vibrato, engine]);
    useEffect(() => {
        engine.setFilterLfoDepth(filterLfo);
    }, [filterLfo, engine]);
    useEffect(() => {
        engine.setTremoloDepth(tremolo);
    }, [tremolo, engine]);
    useEffect(() => {
        engine.setNoiseLevel(noise);
    }, [noise, engine]);

    // Optional: Web MIDI input
    useEffect(() => {
        const active: Array<() => void> = [];
        const anyNav: any = navigator as any;
        if (!anyNav.requestMIDIAccess) return;
        anyNav.requestMIDIAccess().then((access: any) => {
            access.inputs.forEach((input: any) => {
                const onmidimessage = (e: any) => {
                    const [status, note, velocity] = e.data as number[];
                    const cmd = status & 0xf0;
                    const id = `${input.id}:${note}`;
                    if (cmd === 0x90 && velocity > 0) engine.noteOn(note, velocity / 127, id);
                    else if (cmd === 0x80 || (cmd === 0x90 && velocity === 0)) engine.noteOff(id);
                };
                input.addEventListener("midimessage", onmidimessage);
                active.push(() => input.removeEventListener("midimessage", onmidimessage));
            });
        });
        return () => {
            active.forEach((fn) => fn());
        };
    }, [engine]);

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
        const ext = blob.type.includes("mpeg")
            ? "mp3"
            : blob.type.includes("wav")
            ? "wav"
            : blob.type.includes("webm")
            ? "webm"
            : "audio";
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
                {["sine", "square", "sawtooth", "triangle", "custom"].map((w) => (
                    <button
                        key={w}
                        onClick={() => setWave(w as Wave)}
                        className={`px-3 py-1 rounded-full border text-sm ${
                            wave === w ? "bg-cyan-600/20 border-cyan-400" : "hover:opacity-80"
                        }`}>
                        {w}
                    </button>
                ))}
            </div>

            {/* Knobs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
                <Knob
                    label="Freq"
                    value={freq}
                    onChange={setFreq}
                    min={55}
                    max={1760}
                    step={1}
                    format={(v) => `${Math.round(v)} Hz`}
                />
                <Knob
                    label="Volume"
                    value={vol}
                    onChange={setVol}
                    min={0}
                    max={1}
                    step={0.01}
                    format={(v) => `${Math.round(v * 100)}%`}
                />
                <LogKnob label="Cutoff" value={cutoff} onChange={setCutoff} min={50} max={20000} />
                <Knob label="Resonance" value={q} onChange={setQ} min={0.1} max={20} step={0.1} />
                <Knob
                    label="Drive"
                    value={dist}
                    onChange={setDist}
                    min={0}
                    max={1}
                    step={0.01}
                    format={(v) => `${Math.round(v * 100)}%`}
                />
                <div className="hidden md:block" />
                <Knob
                    label="Attack"
                    value={attack}
                    onChange={setAttack}
                    min={0}
                    max={2}
                    step={0.01}
                    format={(v) => `${v.toFixed(2)}s`}
                />
                <Knob
                    label="Decay"
                    value={decay}
                    onChange={setDecay}
                    min={0}
                    max={2}
                    step={0.01}
                    format={(v) => `${v.toFixed(2)}s`}
                />
                {/* Filter Env */}
                <Knob label="F Att" value={fAttack} onChange={setFAttack} min={0} max={2} step={0.005} format={(v) => `${v.toFixed(3)}s`} />
                <Knob label="F Dec" value={fDecay} onChange={setFDecay} min={0} max={2} step={0.01} format={(v) => `${v.toFixed(2)}s`} />
                <Knob label="F Sus" value={fSustain} onChange={setFSustain} min={0} max={1} step={0.01} format={(v) => `${Math.round(v*100)}%`} />
                <Knob label="F Rel" value={fRelease} onChange={setFRelease} min={0} max={3} step={0.01} format={(v) => `${v.toFixed(2)}s`} />
                <Knob label="F Amt" value={fAmount} onChange={setFAmount} min={0} max={8000} step={10} format={(v) => `${Math.round(v)} Hz`} />
                {/* Velocity + polyphony */}
                <Knob label="Vel->Amp" value={velAmp} onChange={setVelAmp} min={0} max={1} step={0.01} format={(v) => `${Math.round(v*100)}%`} />
                <Knob label="Vel->Filt" value={velFilt} onChange={setVelFilt} min={0} max={1} step={0.01} format={(v) => `${Math.round(v*100)}%`} />
                <Knob label="Voices" value={maxVoices} onChange={(v)=>setMaxVoices(Math.round(v))} min={1} max={32} step={1} format={(v)=>`${Math.round(v)}`} />
                <Knob
                    label="Sustain"
                    value={sustain}
                    onChange={setSustain}
                    min={0}
                    max={1}
                    step={0.01}
                    format={(v) => `${Math.round(v * 100)}%`}
                />
                <Knob
                    label="Release"
                    value={release}
                    onChange={setRelease}
                    min={0}
                    max={3}
                    step={0.01}
                    format={(v) => `${v.toFixed(2)}s`}
                />
                <Knob
                    label="LFO Rate"
                    value={lfoRate}
                    onChange={setLfoRate}
                    min={0.1}
                    max={20}
                    step={0.1}
                    format={(v) => `${v.toFixed(1)} Hz`}
                />
                <Knob
                    label="Vibrato"
                    value={vibrato}
                    onChange={setVibrato}
                    min={0}
                    max={100}
                    step={1}
                    format={(v) => `${Math.round(v)} c`}
                />
                <Knob
                    label="Filt LFO"
                    value={filterLfo}
                    onChange={setFilterLfo}
                    min={0}
                    max={2000}
                    step={5}
                    format={(v) => `${Math.round(v)} Hz`}
                />
                <Knob
                    label="Tremolo"
                    value={tremolo}
                    onChange={setTremolo}
                    min={0}
                    max={1}
                    step={0.01}
                    format={(v) => `${Math.round(v * 100)}%`}
                />
                <Knob
                    label="Noise"
                    value={noise}
                    onChange={setNoise}
                    min={0}
                    max={1}
                    step={0.01}
                    format={(v) => `${Math.round(v * 100)}%`}
                />
            </div>

            {/* Recording */}
            <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                    <label className="text-sm opacity-80">Export as</label>
                    <select
                        value={recFmt}
                        onChange={(e) => setRecFmt(e.target.value as any)}
                        className="border rounded px-2 py-1 text-sm bg-transparent">
                        <option value="wav">WAV</option>
                        <option value="mp3">MP3 (fallback to WebM if unsupported)</option>
                    </select>
                </div>
                {!recActive ? (
                    <button onClick={startRec} className="px-3 py-1.5 rounded border hover:opacity-80">
                        Start recording
                    </button>
                ) : (
                    <button
                        onClick={stopRec}
                        className="px-3 py-1.5 rounded border border-red-400 text-red-200 hover:opacity-80">
                        Stop & download
                    </button>
                )}
                {!!recInfo && <span className="text-xs opacity-70">Mode: {recInfo}</span>}
            </div>

            {/* Custom Waveform editor */}
            {wave === "custom" && <WaveEditor value={customShape} onChange={setCustomShape} height={180} />}

            {/* Keyboard */}
            <div className="grid gap-2">
                <div className="text-sm opacity-80">Keyboard (click or use QWERTY: Z row = C3, Q row = C4)</div>
                <Keyboard
                    baseNote={48}
                    octaves={2}
                    onNoteOn={(n, v, id) => engine.noteOn(n, v ?? 1, id ?? n)}
                    onNoteOff={(id) => engine.noteOff(id)}
                />
            </div>

            {/* Export */}
            <SampleExportPanel engine={engine} />

            {/* Presets */}
            <PresetPanel
                getPreset={() => ({
                    name: "",
                    wave,
                    freq,
                    vol,
                    cutoff,
                    q,
                    dist,
                    adsr: { a: attack, d: decay, s: sustain, r: release },
                    fenv: { a: fAttack, d: fDecay, s: fSustain, r: fRelease, amount: fAmount },
                    lfo: { rate: lfoRate, vibrato, filt: filterLfo, trem: tremolo },
                    noise,
                    vel: { amp: velAmp, filt: velFilt },
                    maxVoices,
                    customShape: Array.from(customShape),
                } as any)}
                applyPreset={(p: SynthPreset) => {
                    setWave((p.wave as any) ?? wave);
                    setFreq(p.freq ?? freq);
                    setVol(p.vol ?? vol);
                    setCutoff(p.cutoff ?? cutoff);
                    setQ(p.q ?? q);
                    setDist(p.dist ?? dist);
                    setAttack(p.adsr?.a ?? attack);
                    setDecay(p.adsr?.d ?? decay);
                    setSustain(p.adsr?.s ?? sustain);
                    setRelease(p.adsr?.r ?? release);
                    setFAttack(p.fenv?.a ?? fAttack);
                    setFDecay(p.fenv?.d ?? fDecay);
                    setFSustain(p.fenv?.s ?? fSustain);
                    setFRelease(p.fenv?.r ?? fRelease);
                    setFAmount(p.fenv?.amount ?? fAmount);
                    setLfoRate(p.lfo?.rate ?? lfoRate);
                    setVibrato(p.lfo?.vibrato ?? vibrato);
                    setFilterLfo(p.lfo?.filt ?? filterLfo);
                    setTremolo(p.lfo?.trem ?? tremolo);
                    setNoise(p.noise ?? noise);
                    setVelAmp(p.vel?.amp ?? velAmp);
                    setVelFilt(p.vel?.filt ?? velFilt);
                    setMaxVoices(p.maxVoices ?? maxVoices);
                    if (p.customShape && p.customShape.length) setCustomShape(Float32Array.from(p.customShape));
                }}
            />

            <p className="text-xs opacity-60">
                Tip: tweak knobs while recording to capture changes. WAV records raw PCM in-browser. MP3 depends on
                browser support and may fall back to WebM/Opus.
            </p>
        </main>
    );
}

function makeSine(N: number) {
    const out = new Float32Array(N);
    for (let i = 0; i < N; i++) out[i] = Math.sin((i / N) * 2 * Math.PI);
    return out;
}
