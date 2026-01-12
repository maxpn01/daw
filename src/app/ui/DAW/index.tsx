"use client";

import { useAudioEngine } from "@/lib/audio/audioEngine";
import styles from "./DAW.module.scss";
import Piano from "../Piano";

export default function DAW() {
    const { playNote } = useAudioEngine();

    return (
        <div className={styles.daw}>
            <div className={styles.board}>
                <Piano playNote={playNote} />
            </div>
        </div>
    );
}
