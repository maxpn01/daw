declare global {
    interface WebAudioFontLoader {
        loaded(name: string): boolean;
        decodeAfterLoading(audioContext: AudioContext, name: string): void;
    }

    interface WebAudioFontPlayer {
        loader: WebAudioFontLoader;
        queueWaveTable(
            context: BaseAudioContext,
            destination: AudioNode,
            preset: unknown,
            when: number,
            pitch: number,
            duration?: number,
            volume?: number
        ): void;
    }

    interface Window {
        WebAudioFontPlayer?: new () => WebAudioFontPlayer;
        webkitAudioContext?: typeof webkitAudioContext;
    }
}

export {};
