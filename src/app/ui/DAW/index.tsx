"use client";

import clsx from "clsx";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioEngine } from "@/lib/audio/audioEngine";
import styles from "./DAW.module.scss";
import Piano from "../Piano";
import PianoRoll, { STEP_COUNT } from "../PianoRoll";

export default function DAW() {
    const { playNote, resume } = useAudioEngine();
    const [showPianoRoll, setShowPianoRoll] = useState(true);
    const [showPiano, setShowPiano] = useState(true);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [bpm, setBpm] = useState(120);
    const [activeCells, setActiveCells] = useState<Set<string>>(() => new Set());
    const [currentStep, setCurrentStep] = useState<number | null>(null);
    const activeCellsRef = useRef(activeCells);
    const stepRef = useRef(0);
    const intervalRef = useRef<number | null>(null);
    const safeBpm = Math.min(240, Math.max(40, bpm));
    const stepMs = (60 / safeBpm / 4) * 1000;
    const stepDuration = (60 / safeBpm / 4) * 0.9;

    useEffect(() => {
        activeCellsRef.current = activeCells;
    }, [activeCells]);

    const toggleCell = useCallback((midi: number, step: number) => {
        const key = `${midi}:${step}`;
        setActiveCells((prev) => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    }, []);

    const playStep = useCallback(() => {
        const step = stepRef.current;
        setCurrentStep(step);
        activeCellsRef.current.forEach((key) => {
            const [midiRaw, stepRaw] = key.split(":");
            if (Number(stepRaw) !== step) return;
            const midi = Number(midiRaw);
            if (Number.isNaN(midi)) return;
            void playNote(midi, { duration: stepDuration, velocity: 0.4, type: "triangle" });
        });
        stepRef.current = (step + 1) % STEP_COUNT;
    }, [playNote, stepDuration]);

    const handlePlay = useCallback(async () => {
        if (isPlaying) return;
        await resume();
        if (!isPaused) {
            stepRef.current = 0;
        }
        playStep();
        intervalRef.current = window.setInterval(playStep, stepMs);
        setIsPlaying(true);
        setIsPaused(false);
    }, [isPaused, isPlaying, playStep, resume, stepMs]);

    const handlePause = useCallback(() => {
        if (!isPlaying) return;
        if (intervalRef.current !== null) {
            window.clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        setIsPlaying(false);
        setIsPaused(true);
    }, [isPlaying]);

    const handleStop = useCallback(() => {
        if (intervalRef.current !== null) {
            window.clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        setIsPlaying(false);
        setIsPaused(false);
        stepRef.current = 0;
        setCurrentStep(null);
    }, []);

    useEffect(() => {
        return () => {
            if (intervalRef.current !== null) {
                window.clearInterval(intervalRef.current);
            }
        };
    }, []);

    return (
        <div className={styles.daw}>
            <header className={styles.header}>
                <div className={styles.transport}>
                    <button
                        type="button"
                        onClick={handlePlay}
                        className={clsx(styles.transportButton, styles.playButton, isPlaying && styles.playing)}>
                        Play
                    </button>
                    <button
                        type="button"
                        onClick={handlePause}
                        className={clsx(styles.transportButton, styles.pauseButton)}>
                        Pause
                    </button>
                    <button type="button" onClick={handleStop} className={styles.transportButton}>
                        Stop
                    </button>
                    <label className={styles.tempo}>
                        <span>Tempo</span>
                        <input
                            type="number"
                            inputMode="numeric"
                            min={40}
                            max={240}
                            step={1}
                            value={bpm}
                            onChange={(event) => setBpm(Number(event.target.value))}
                            className={styles.tempoInput}
                            aria-label="Tempo in BPM"
                        />
                        <span>BPM</span>
                    </label>
                </div>
                <div className={styles.modules}>
                    <button
                        type="button"
                        aria-pressed={showPianoRoll}
                        onClick={() => setShowPianoRoll((prev) => !prev)}
                        className={clsx(styles.moduleToggle, showPianoRoll && styles.moduleToggleActive)}>
                        Piano Roll
                    </button>
                    <button
                        type="button"
                        aria-pressed={showPiano}
                        onClick={() => setShowPiano((prev) => !prev)}
                        className={clsx(styles.moduleToggle, showPiano && styles.moduleToggleActive)}>
                        Piano
                    </button>
                </div>
            </header>

            <main className={styles.main}>
                {showPianoRoll && (
                    <div className={styles.trackPanel}>
                        <PianoRoll
                            activeCells={activeCells}
                            onToggle={toggleCell}
                            currentStep={currentStep}
                            bpm={bpm}
                        />
                    </div>
                )}
            </main>

            {showPiano && (
                <section className={styles.pianoPanel}>
                    <Piano playNote={playNote} />
                </section>
            )}
        </div>
    );
}
