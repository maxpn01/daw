"use client";
import { useEffect, useRef } from "react";

export function Visualizer({ analyser }: { analyser?: AnalyserNode }) {
    const ref = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = ref.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // HiDPI scale
        const ratio = window.devicePixelRatio || 1;
        const cssW = canvas.clientWidth || 800;
        const cssH = canvas.clientHeight || 180;
        canvas.width = Math.floor(cssW * ratio);
        canvas.height = Math.floor(cssH * ratio);
        ctx.setTransform(1, 0, 0, 1, 0, 0); // reset in case effect re-runs
        ctx.scale(ratio, ratio);

        // Improve visibility on dark/light backgrounds
        const bodyColor = getComputedStyle(document.body).color || "#22d3ee";
        ctx.strokeStyle = bodyColor;
        ctx.lineWidth = 2;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";

        if (!analyser) return;

        const buffer = new Uint8Array(analyser.fftSize);
        let raf = 0;
        const loop = () => {
            raf = requestAnimationFrame(loop);
            analyser.getByteTimeDomainData(buffer);
            ctx.clearRect(0, 0, cssW, cssH);
            ctx.beginPath();
            for (let i = 0; i < buffer.length; i++) {
                const x = (i / (buffer.length - 1)) * cssW;
                const y = (buffer[i] / 255) * cssH;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        };

        loop();
        return () => cancelAnimationFrame(raf);
    }, [analyser]);

    // Show a clear placeholder until an analyser is available
    if (!analyser) {
        return (
            <div className="w-full h-40 border flex items-center justify-center text-sm opacity-70 select-none">
                Waiting for audio… Click “Start test tone”.
            </div>
        );
    }

    return <canvas ref={ref} className="w-full h-40 border" />;
}
