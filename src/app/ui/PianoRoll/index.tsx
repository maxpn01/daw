"use client";

import clsx from "clsx";
import { useCallback, useMemo, type CSSProperties } from "react";
import styles from "./PianoRoll.module.scss";
import { NOTE_NAMES } from "@/lib/audio/consts";

type NoteRow = {
    midi: number;
    label: string;
    isBlack: boolean;
    isOctaveRoot: boolean;
};

export const STEP_COUNT = 32;
const START_MIDI = 48;
const END_MIDI = 72;

const buildRows = (start: number, end: number): NoteRow[] => {
    const rows: NoteRow[] = [];
    for (let midi = end; midi >= start; midi -= 1) {
        const note = NOTE_NAMES[midi % 12];
        const octave = Math.floor(midi / 12) - 1;
        rows.push({
            midi,
            label: `${note}${octave}`,
            isBlack: note.includes("#"),
            isOctaveRoot: note === "C",
        });
    }
    return rows;
};

type PianoRollProps = {
    activeCells: Set<string>;
    onToggle: (midi: number, step: number) => void;
    currentStep: number | null;
    bpm: number;
};

export default function PianoRoll({ activeCells, onToggle, currentStep, bpm }: PianoRollProps) {
    const rows = useMemo(() => buildRows(START_MIDI, END_MIDI), []);
    const steps = useMemo(() => Array.from({ length: STEP_COUNT }, (_, step) => step), []);
    const playheadStep = currentStep ?? 0;
    const showPlayhead = currentStep !== null;

    const toggleCell = useCallback((midi: number, step: number) => onToggle(midi, step), [onToggle]);

    return (
        <section
            className={clsx(styles.roll, showPlayhead && styles.playheadActive)}
            style={
                {
                    "--step-count": STEP_COUNT,
                    "--current-step": playheadStep,
                } as CSSProperties
            }>
            <header className={styles.rollHeader}>
                <div className={styles.rollTitle}>Piano Roll</div>
                <div className={styles.rollMeta}>4/4 · {bpm} BPM</div>
            </header>
            <div className={styles.grid}>
                <div className={styles.gridHeader}>
                    <div className={styles.keyHeader}>Keys</div>
                    <div className={styles.stepHeader}>
                        {steps.map((step) => (
                            <div
                                key={step}
                                className={clsx(styles.stepLabel, step % 4 === 0 && styles.stepMajor)}>
                                {step % 4 === 0 ? step / 4 + 1 : ""}
                            </div>
                        ))}
                    </div>
                </div>
                <div className={styles.gridBody}>
                    <div className={styles.playhead} aria-hidden="true" />
                    {rows.map((row) => (
                        <div
                            key={row.midi}
                            className={clsx(styles.row, row.isOctaveRoot && styles.octaveRow)}>
                            <div className={clsx(styles.keyCell, row.isBlack && styles.keyBlack)}>
                                {row.label}
                            </div>
                            <div className={styles.rowSteps}>
                                {steps.map((step) => {
                                    const key = `${row.midi}:${step}`;
                                    const isActive = activeCells.has(key);
                                    return (
                                        <button
                                            key={key}
                                            type="button"
                                            aria-pressed={isActive}
                                            aria-label={`${row.label} step ${step + 1}`}
                                            onClick={() => toggleCell(row.midi, step)}
                                            className={clsx(
                                                styles.stepCell,
                                                step % 4 === 0 && styles.stepMajor,
                                                isActive && styles.stepActive
                                            )}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
