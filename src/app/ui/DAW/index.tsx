"use client";

import { useWebAudioFont } from "@/lib/audio/webaudiofont";
import styles from "./DAW.module.scss";
import Piano from "../Piano";

export default function DAW() {
    const { playNote } = useWebAudioFont();

    return (
        <div className={styles.daw}>
            <div className={styles.board}>
                <Piano playNote={playNote} />
            </div>
        </div>
    );
}
