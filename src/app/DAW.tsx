"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./DAW.scss";

const PLAYER_SCRIPT = "https://surikov.github.io/webaudiofont/npm/dist/WebAudioFontPlayer.js";
const INSTRUMENT_NAME = "_tone_0000_Chaos_sf2_file";
const INSTRUMENT_SCRIPT = "https://surikov.github.io/webaudiofontdata/sound/0000_Chaos_sf2_file.js";
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const buildKeyRange = (startMidi: number, endMidi: number) => {
    const whiteKeys: { label: string; midi: number }[] = [];
    const blackKeys: { label: string; midi: number; between: number }[] = [];
    let whiteIndex = -1;

    for (let midi = startMidi; midi <= endMidi; midi += 1) {
        const note = NOTE_NAMES[midi % 12];
        const octave = Math.floor(midi / 12) - 1;
        const label = `${note}${octave}`;
        const isBlack = note.includes("#");

        if (isBlack) {
            blackKeys.push({ label, midi, between: whiteIndex });
        } else {
            whiteIndex += 1;
            whiteKeys.push({ label, midi });
        }
    }

    return { whiteKeys, blackKeys };
};

const { whiteKeys: WHITE_KEYS, blackKeys: BLACK_KEYS } = buildKeyRange(48, 83);

const KEYBOARD_MAP: Record<string, number> = {
    z: 48,
    x: 50,
    c: 52,
    v: 53,
    b: 55,
    n: 57,
    m: 59,
    a: 60,
    w: 61,
    s: 62,
    e: 63,
    d: 64,
    f: 65,
    t: 66,
    g: 67,
    y: 68,
    h: 69,
    u: 70,
    j: 71,
    k: 72,
    o: 73,
    l: 74,
    p: 75,
    ";": 76,
    "'": 77,
};

export default function DAW() {
    const audioContextRef = useRef<AudioContext | null>(null);
    const playerRef = useRef<InstanceType<NonNullable<Window["WebAudioFontPlayer"]>> | null>(null);
    const instrumentRef = useRef<unknown | null>(null);
    const instrumentLoadRequestedRef = useRef(false);
    const pressedKeysRef = useRef(new Set<string>());
    const scriptPromisesRef = useRef(new Map<string, Promise<void>>());
    const [activeNotes, setActiveNotes] = useState<Set<number>>(() => new Set());

    const blackKeyLayout = useMemo(() => {
        const whiteWidth = 100 / WHITE_KEYS.length;
        const blackWidth = whiteWidth * 0.6;
        return BLACK_KEYS.map((key) => ({
            ...key,
            width: `${blackWidth}%`,
            left: `calc(${(key.between + 1) * whiteWidth}% - ${blackWidth / 2}%)`,
        }));
    }, []);

    const activateNote = useCallback((midi: number) => {
        setActiveNotes((prev) => {
            if (prev.has(midi)) return prev;
            const next = new Set(prev);
            next.add(midi);
            return next;
        });
    }, []);

    const deactivateNote = useCallback((midi: number) => {
        setActiveNotes((prev) => {
            if (!prev.has(midi)) return prev;
            const next = new Set(prev);
            next.delete(midi);
            return next;
        });
    }, []);

    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const getGlobalInstrument = useCallback(
        () => (window as unknown as Record<string, unknown>)[INSTRUMENT_NAME],
        []
    );

    const loadScript = useCallback((src: string, readyCheck: () => boolean) => {
        if (readyCheck()) return Promise.resolve();
        const cached = scriptPromisesRef.current.get(src);
        if (cached) return cached;

        const promise = new Promise<void>((resolve, reject) => {
            const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
            if (existing) {
                existing.addEventListener("load", () => resolve(), { once: true });
                existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
                return;
            }
            const script = document.createElement("script");
            script.src = src;
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Failed to load ${src}`));
            document.head.appendChild(script);
        });

        scriptPromisesRef.current.set(src, promise);
        return promise;
    }, []);

    const waitForInstrumentReady = useCallback(async () => {
        const player = playerRef.current;
        if (!player) return false;
        const start = performance.now();
        const timeout = 5000;
        while (!player.loader.loaded(INSTRUMENT_NAME)) {
            if (performance.now() - start > timeout) return false;
            await wait(50);
        }
        return true;
    }, []);

    const ensureAudio = useCallback(async () => {
        if (typeof window === "undefined") return null;
        await loadScript(PLAYER_SCRIPT, () => Boolean(window.WebAudioFontPlayer));
        await loadScript(INSTRUMENT_SCRIPT, () => Boolean(getGlobalInstrument()));
        if (!audioContextRef.current) {
            const AudioContextImpl = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextImpl) return null;
            audioContextRef.current = new AudioContextImpl();
        }
        if (audioContextRef.current.state === "suspended") {
            await audioContextRef.current.resume();
        }
        if (!playerRef.current && window.WebAudioFontPlayer) {
            playerRef.current = new window.WebAudioFontPlayer();
        }
        if (playerRef.current && !instrumentLoadRequestedRef.current) {
            playerRef.current.loader.decodeAfterLoading(audioContextRef.current, INSTRUMENT_NAME);
            instrumentLoadRequestedRef.current = true;
        }

        if (!instrumentRef.current) {
            const loadedInstrument = getGlobalInstrument();
            if (loadedInstrument) {
                instrumentRef.current = loadedInstrument;
            }
        }

        const instrumentReady = await waitForInstrumentReady();
        if (!instrumentRef.current && instrumentReady) {
            const loadedInstrument = getGlobalInstrument();
            if (loadedInstrument) {
                instrumentRef.current = loadedInstrument;
            }
        }
        if (!playerRef.current || !instrumentRef.current) return null;
        return { ac: audioContextRef.current, player: playerRef.current, instrument: instrumentRef.current };
    }, [getGlobalInstrument, loadScript, waitForInstrumentReady]);

    useEffect(() => {
        void loadScript(PLAYER_SCRIPT, () => Boolean(window.WebAudioFontPlayer));
        void loadScript(INSTRUMENT_SCRIPT, () => Boolean(getGlobalInstrument()));
    }, [getGlobalInstrument, loadScript]);

    const playNote = useCallback(
        async (midi: number) => {
            try {
                const audio = await ensureAudio();
                if (!audio) return;
                audio.player.queueWaveTable(
                    audio.ac,
                    audio.ac.destination,
                    audio.instrument,
                    audio.ac.currentTime,
                    midi,
                    1.4,
                    0.45
                );
            } catch (error) {
                console.error("Unable to play note", error);
            }
        },
        [ensureAudio]
    );

    useEffect(() => {
        const pressedKeys = pressedKeysRef.current;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.repeat) return;
            const key = event.key.toLowerCase();
            const midi = KEYBOARD_MAP[key];
            if (midi === undefined) return;
            event.preventDefault();
            if (pressedKeys.has(key)) return;
            pressedKeys.add(key);
            activateNote(midi);
            void playNote(midi);
        };

        const handleKeyUp = (event: KeyboardEvent) => {
            const key = event.key.toLowerCase();
            const midi = KEYBOARD_MAP[key];
            if (pressedKeys.has(key)) {
                pressedKeys.delete(key);
                if (midi !== undefined) {
                    deactivateNote(midi);
                }
            }
        };

        const handleBlur = () => {
            pressedKeys.clear();
            setActiveNotes(new Set());
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);
        window.addEventListener("blur", handleBlur);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
            window.removeEventListener("blur", handleBlur);
        };
    }, [activateNote, deactivateNote, playNote]);

    return (
        <div className="daw">
            <div className="daw__board">
                <div className="daw__keyboard">
                    <div className="daw__whites">
                        {WHITE_KEYS.map((key) => (
                            <button
                                key={key.label}
                                type="button"
                                onPointerDown={() => {
                                    activateNote(key.midi);
                                    void playNote(key.midi);
                                }}
                                onPointerUp={() => deactivateNote(key.midi)}
                                onPointerLeave={() => deactivateNote(key.midi)}
                                className={`daw__white${activeNotes.has(key.midi) ? " daw__white--active" : ""}`}>
                                {key.label}
                            </button>
                        ))}
                    </div>
                    {blackKeyLayout.map((key) => (
                        <button
                            key={key.label}
                            type="button"
                            onPointerDown={() => {
                                activateNote(key.midi);
                                void playNote(key.midi);
                            }}
                            onPointerUp={() => deactivateNote(key.midi)}
                            onPointerLeave={() => deactivateNote(key.midi)}
                            className={`daw__black${activeNotes.has(key.midi) ? " daw__black--active" : ""}`}
                            style={{ left: key.left, width: key.width }}>
                            {key.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
