/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { AudioEngine, Wave, INSTRUMENT_OPTIONS, InstrumentId } from "@/lib/audio/AudioEngine";
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
    const [instrument, setInstrument] = useState<InstrumentId>("piano");
    const [userInstruments, setUserInstruments] = useState<Array<{ id: InstrumentId; label: string }>>([]);
    const [instrumentLoading, setInstrumentLoading] = useState(false);
    const [instrumentError, setInstrumentError] = useState<string>("");
    const [customRoot, setCustomRoot] = useState(60);
    const isSynth = instrument === "synth";
    const keyboardBase = instrument === "drums" ? 36 : instrument === "bass" ? 36 : 48;
    const keyboardOctaves = instrument === "drums" ? 1 : 2;

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
    // Unison
    const [unisonCount, setUnisonCount] = useState(1);
    const [unisonDetune, setUnisonDetune] = useState(0);
    const [stereoSpread, setStereoSpread] = useState(0);

    // Filter keytracking
    const [fKeytrack, setFKeytrack] = useState(0);

    // FX
    const [delayTime, setDelayTime] = useState(0);
    const [delayFb, setDelayFb] = useState(0.25);
    const [delayMix, setDelayMix] = useState(0);
    const [revSize, setRevSize] = useState(2);
    const [revMix, setRevMix] = useState(0);

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
        let cancelled = false;
        setInstrumentLoading(true);
        setInstrumentError("");
        engine
            .setInstrument(instrument)
            .catch((err: unknown) => {
                console.error(err);
                if (!cancelled) setInstrumentError(err instanceof Error ? err.message : "Failed to load instrument");
            })
            .finally(() => {
                if (!cancelled) setInstrumentLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [engine, instrument]);

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
    useEffect(() => {
        engine.setAmpVelocitySensitivity(velAmp);
    }, [engine, velAmp]);
    useEffect(() => {
        engine.setFilterVelocitySensitivity(velFilt);
    }, [engine, velFilt]);
    useEffect(() => {
        engine.setMaxVoices(maxVoices);
    }, [engine, maxVoices]);

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
    useEffect(() => {
        engine.setFilterKeytrack(fKeytrack);
    }, [fKeytrack, engine]);
    useEffect(() => {
        engine.setUnisonCount(unisonCount);
        engine.setUnisonDetune(unisonDetune);
        engine.setStereoSpread(stereoSpread);
    }, [engine, unisonCount, unisonDetune, stereoSpread]);
    useEffect(() => {
        engine.setDelay(delayTime, delayFb, delayMix);
    }, [delayTime, delayFb, delayMix, engine]);
    useEffect(() => {
        engine.setReverb(revSize, revMix);
    }, [revSize, revMix, engine]);

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

    const handleInstrumentFile = useCallback(
        async (files: FileList | null) => {
            if (!files || !files.length) return;
            const file = files[0];
            try {
                setInstrumentLoading(true);
                setInstrumentError("");
                const buffer = await file.arrayBuffer();
                const id = await engine.addUserInstrument(buffer, customRoot);
                const baseLabel = file.name.replace(/\.[^/.]+$/, "");
                setUserInstruments((prev) => {
                    const label = baseLabel || `User Sample ${prev.length + 1}`;
                    return [...prev, { id, label }];
                });
                setInstrument(id);
            } catch (err) {
                console.error(err);
                setInstrumentError(err instanceof Error ? err.message : "Unable to import sample");
            } finally {
                setInstrumentLoading(false);
            }
        },
        [engine, customRoot]
    );

    const onCustomFileChange = useCallback(
        (event: ChangeEvent<HTMLInputElement>) => {
            const files = event.target.files;
            void handleInstrumentFile(files);
            event.target.value = "";
        },
        [handleInstrumentFile]
    );

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

            {/* Instrument select */}
            <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm opacity-80">Instrument:</span>
                    <select
                        value={instrument}
                        onChange={(e) => setInstrument(e.target.value as InstrumentId)}
                        className="border rounded px-2 pr-8 py-1.5 text-sm select-reset min-w-[10rem]">
                        {INSTRUMENT_OPTIONS.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                                {opt.label}
                            </option>
                        ))}
                        {userInstruments.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                    <label className="flex items-center gap-1 text-xs opacity-80">
                        <span>Root note</span>
                        <input
                            type="number"
                            min={0}
                            max={127}
                            value={customRoot}
                            onChange={(e) => {
                                const num = Number(e.target.value);
                                if (Number.isFinite(num)) {
                                    setCustomRoot(Math.max(0, Math.min(127, Math.round(num))));
                                }
                            }}
                            className="w-16 border rounded px-1 py-0.5 text-xs bg-transparent"
                        />
                    </label>
                    <label className="text-xs border rounded px-2 py-1 cursor-pointer hover:opacity-80">
                        <input type="file" accept=".wav,audio/wav,audio/*" onChange={onCustomFileChange} className="hidden" />
                        Add sample
                    </label>
                    {instrumentLoading && <span className="text-xs opacity-60">Loading…</span>}
                </div>
                {!!instrumentError && <span className="text-xs text-red-300">{instrumentError}</span>}
            </div>

            {/* Waveform select */}
            <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm opacity-80">Wave:</span>
                {["sine", "square", "sawtooth", "triangle", "custom"].map((w) => (
                    <button
                        key={w}
                        onClick={() => isSynth && setWave(w as Wave)}
                        disabled={!isSynth}
                        className={`px-3 py-1 rounded-full border text-sm ${
                            wave === w ? "bg-cyan-600/20 border-cyan-400" : "hover:opacity-80"
                        } ${!isSynth ? "opacity-40 cursor-not-allowed" : ""}`}>
                        {w}
                    </button>
                ))}
            </div>
            {!isSynth && <span className="text-xs opacity-60">Wave controls are available for the synth engine.</span>}

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
                <Knob
                    label="F Att"
                    value={fAttack}
                    onChange={setFAttack}
                    min={0}
                    max={2}
                    step={0.005}
                    format={(v) => `${v.toFixed(3)}s`}
                />
                <Knob
                    label="F Dec"
                    value={fDecay}
                    onChange={setFDecay}
                    min={0}
                    max={2}
                    step={0.01}
                    format={(v) => `${v.toFixed(2)}s`}
                />
                <Knob
                    label="F Sus"
                    value={fSustain}
                    onChange={setFSustain}
                    min={0}
                    max={1}
                    step={0.01}
                    format={(v) => `${Math.round(v * 100)}%`}
                />
                <Knob
                    label="F Rel"
                    value={fRelease}
                    onChange={setFRelease}
                    min={0}
                    max={3}
                    step={0.01}
                    format={(v) => `${v.toFixed(2)}s`}
                />
                <Knob
                    label="F Amt"
                    value={fAmount}
                    onChange={setFAmount}
                    min={0}
                    max={8000}
                    step={10}
                    format={(v) => `${Math.round(v)} Hz`}
                />
                {/* Velocity + polyphony */}
                <Knob
                    label="Vel->Amp"
                    value={velAmp}
                    onChange={setVelAmp}
                    min={0}
                    max={1}
                    step={0.01}
                    format={(v) => `${Math.round(v * 100)}%`}
                />
                <Knob
                    label="Vel->Filt"
                    value={velFilt}
                    onChange={setVelFilt}
                    min={0}
                    max={1}
                    step={0.01}
                    format={(v) => `${Math.round(v * 100)}%`}
                />
                <Knob
                    label="Voices"
                    value={maxVoices}
                    onChange={(v) => setMaxVoices(Math.round(v))}
                    min={1}
                    max={32}
                    step={1}
                    format={(v) => `${Math.round(v)}`}
                />
                {/* Unison */}
                <Knob
                    label="Unison"
                    value={unisonCount}
                    onChange={(v) => setUnisonCount(Math.round(v))}
                    min={1}
                    max={7}
                    step={1}
                    format={(v) => `${Math.round(v)}`}
                />
                <Knob
                    label="Detune"
                    value={unisonDetune}
                    onChange={setUnisonDetune}
                    min={0}
                    max={100}
                    step={1}
                    format={(v) => `${Math.round(v)} c`}
                />
                <Knob
                    label="Spread"
                    value={stereoSpread}
                    onChange={setStereoSpread}
                    min={0}
                    max={1}
                    step={0.01}
                    format={(v) => `${Math.round(v * 100)}%`}
                />
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
                    label="Filt KT"
                    value={fKeytrack}
                    onChange={setFKeytrack}
                    min={0}
                    max={1}
                    step={0.01}
                    format={(v) => `${Math.round(v * 100)}%`}
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
                    max={2400}
                    step={5}
                    format={(v) => `${Math.round(v)} c`}
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

            {/* FX */}
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
                <Knob
                    label="Delay"
                    value={delayTime}
                    onChange={setDelayTime}
                    min={0}
                    max={2}
                    step={0.01}
                    format={(v) => `${v.toFixed(2)}s`}
                />
                <Knob
                    label="Dly FB"
                    value={delayFb}
                    onChange={setDelayFb}
                    min={0}
                    max={0.95}
                    step={0.01}
                    format={(v) => `${Math.round(v * 100)}%`}
                />
                <Knob
                    label="Dly Mix"
                    value={delayMix}
                    onChange={setDelayMix}
                    min={0}
                    max={1}
                    step={0.01}
                    format={(v) => `${Math.round(v * 100)}%`}
                />
                <Knob
                    label="Rev Size"
                    value={revSize}
                    onChange={setRevSize}
                    min={0.1}
                    max={6}
                    step={0.1}
                    format={(v) => `${v.toFixed(1)}s`}
                />
                <Knob
                    label="Rev Mix"
                    value={revMix}
                    onChange={setRevMix}
                    min={0}
                    max={1}
                    step={0.01}
                    format={(v) => `${Math.round(v * 100)}%`}
                />
            </div>

            {/* Recording */}
            <div className="flex items-center gap-3 flex-wrap">
                <button onClick={() => engine.allNotesOff()} className="px-3 py-1.5 rounded border hover:opacity-80">
                    Panic (All Notes Off)
                </button>
                <div className="flex items-center gap-2">
                    <label className="text-sm opacity-80">Export as</label>
                    <div className="relative">
                        <select
                            value={recFmt}
                            onChange={(e) => setRecFmt(e.target.value as any)}
                            className="border rounded px-2 pr-10 py-1.5 text-sm select-reset">
                            <option value="wav">WAV</option>
                            <option value="mp3">MP3 (fallback to WebM if unsupported)</option>
                        </select>
                        <svg
                            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 opacity-70"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            aria-hidden="true">
                            <path d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z" />
                        </svg>
                    </div>
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
                    baseNote={keyboardBase}
                    octaves={keyboardOctaves}
                    onNoteOn={(n, v, id) => {
                        if (instrumentLoading) return;
                        engine.noteOn(n, v ?? 1, id ?? n);
                    }}
                    onNoteOff={(id) => engine.noteOff(id)}
                />
            </div>

            {/* Export */}
            <SampleExportPanel engine={engine} />

            {/* Presets */}
            <PresetPanel
                getPreset={() =>
                    ({
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
                        unison: { count: unisonCount, detune: unisonDetune, spread: stereoSpread },
                        customShape: Array.from(customShape),
                    } as any)
                }
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
                    const u: any = (p as any).unison;
                    if (u) {
                        setUnisonCount(u.count ?? unisonCount);
                        setUnisonDetune(u.detune ?? unisonDetune);
                        setStereoSpread(u.spread ?? stereoSpread);
                    }
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
