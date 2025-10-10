"use client";
import { useEffect, useRef, useState } from "react";

export function Visualizer({ analyser }: { analyser?: AnalyserNode }) {
    const ref = useRef<HTMLCanvasElement>(null);
    const [mode, setMode] = useState<'time'|'spectrum'>('time');

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
        const freqBuf = new Uint8Array(analyser.frequencyBinCount);
        let raf = 0;
        const loop = () => {
            raf = requestAnimationFrame(loop);
            ctx.clearRect(0, 0, cssW, cssH);
            if (mode === 'time') {
                analyser.getByteTimeDomainData(buffer);
                ctx.beginPath();
                for (let i = 0; i < buffer.length; i++) {
                    const x = (i / (buffer.length - 1)) * cssW;
                    const y = (buffer[i] / 255) * cssH;
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.stroke();
            } else {
                analyser.getByteFrequencyData(freqBuf);
                const barW = cssW / freqBuf.length;
                for (let i = 0; i < freqBuf.length; i++) {
                    const v = freqBuf[i] / 255;
                    const h = v * cssH;
                    ctx.fillStyle = bodyColor as string;
                    ctx.fillRect(i * barW, cssH - h, Math.max(1, barW - 1), h);
                }
            }
        };

        loop();
        return () => cancelAnimationFrame(raf);
    }, [analyser, mode]);

    // Show a clear placeholder until an analyser is available
    if (!analyser) {
        return (
            <div className="w-full h-40 border flex items-center justify-center text-sm opacity-70 select-none">
                Waiting for audio… Click “Start test tone”.
            </div>
        );
    }

    return (
        <div className="grid gap-2">
            <div className="flex items-center gap-2 text-xs opacity-80">
                <span>View:</span>
                <button className={`px-2 py-0.5 rounded border ${mode==='time'?'bg-cyan-600/20 border-cyan-400':''}`} onClick={()=>setMode('time')}>Wave</button>
                <button className={`px-2 py-0.5 rounded border ${mode==='spectrum'?'bg-cyan-600/20 border-cyan-400':''}`} onClick={()=>setMode('spectrum')}>Spectrum</button>
            </div>
            <canvas ref={ref} className="w-full h-40 border" />
        </div>
    );
}
