import { useCallback, useEffect, useRef } from "react";
import { INSTRUMENT_NAME, INSTRUMENT_SCRIPT, PLAYER_SCRIPT } from "./consts";

export type PlayNote = (midi: number) => Promise<void>;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function useWebAudioFont() {
    const audioContextRef = useRef<AudioContext | null>(null);
    const playerRef = useRef<InstanceType<NonNullable<Window["WebAudioFontPlayer"]>> | null>(null);
    const instrumentRef = useRef<unknown | null>(null);
    const instrumentLoadRequestedRef = useRef(false);
    const scriptPromisesRef = useRef(new Map<string, Promise<void>>());

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

    const playNote = useCallback<PlayNote>(
        async (midi) => {
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

    return { playNote };
}
