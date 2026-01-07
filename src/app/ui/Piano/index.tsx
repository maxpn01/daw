import clsx from "clsx";
import styles from "./Piano.module.scss";
import { NOTE_NAMES } from "@/lib/audio/consts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PlayNote } from "@/lib/audio/webaudiofont";

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

type Key = { label: string; midi: number };
type BlackKey = Key & { between: number };
type BlackLayoutKey = Key & { left: string; width: string };

const buildKeyRange = (startMidi: number, endMidi: number) => {
    const whiteKeys: Key[] = [];
    const blackKeys: BlackKey[] = [];
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

const { whiteKeys: WHITE_KEYS, blackKeys: BLACK_KEYS } = buildKeyRange(36, 95);

export default function Piano({ playNote }: { playNote: PlayNote }) {
    const blackKeyLayout = useMemo(() => {
        const whiteWidth = 100 / WHITE_KEYS.length;
        const blackWidth = whiteWidth * 0.6;
        return BLACK_KEYS.map((key) => ({
            ...key,
            width: `${blackWidth}%`,
            left: `calc(${(key.between + 1) * whiteWidth}% - ${blackWidth / 2}%)`,
        }));
    }, []);

    const pressedKeysRef = useRef(new Set<string>());
    const [activeNotes, setActiveNotes] = useState<Set<number>>(() => new Set());

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

    const handleNoteOn = useCallback(
        (midi: number) => {
            activateNote(midi);
            void playNote(midi);
        },
        [activateNote, playNote]
    );

    const handleNoteOff = useCallback((midi: number) => deactivateNote(midi), [deactivateNote]);

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
            handleNoteOn(midi);
        };

        const handleKeyUp = (event: KeyboardEvent) => {
            const key = event.key.toLowerCase();
            const midi = KEYBOARD_MAP[key];
            if (pressedKeys.has(key)) {
                pressedKeys.delete(key);
                if (midi !== undefined) {
                    handleNoteOff(midi);
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
    }, [handleNoteOn, handleNoteOff]);

    return (
        <div className={styles.piano}>
            <div className={styles.whites}>
                {WHITE_KEYS.map((key: Key) => (
                    <button
                        key={key.label}
                        type="button"
                        onPointerDown={() => handleNoteOn(key.midi)}
                        onPointerUp={() => handleNoteOff(key.midi)}
                        onPointerLeave={() => handleNoteOff(key.midi)}
                        className={clsx(styles.white, activeNotes.has(key.midi) && styles.whiteActive)}>
                        {key.label}
                    </button>
                ))}
            </div>

            {blackKeyLayout.map((key: BlackLayoutKey) => (
                <button
                    key={key.label}
                    type="button"
                    onPointerDown={() => handleNoteOn(key.midi)}
                    onPointerUp={() => handleNoteOff(key.midi)}
                    onPointerLeave={() => handleNoteOff(key.midi)}
                    className={clsx(styles.black, activeNotes.has(key.midi) && styles.blackActive)}
                    style={{ left: key.left, width: key.width }}>
                    {key.label}
                </button>
            ))}
        </div>
    );
}
