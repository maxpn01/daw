"use client";
import { useEffect, useRef, useState } from "react";

type Props = {
    value: Float32Array<ArrayBuffer>; // one period, -1..1
    onChange: (samples: Float32Array<ArrayBuffer>) => void;
    height?: number;
    brush?: number; // 1..20 logical samples radius
};

export default function WaveEditor({ value, onChange, height = 160, brush = 4 }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [dragging, setDragging] = useState(false);
    const [hovering, setHovering] = useState(false);
    const samples = value; // treat as external state

    // draw
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const ratio = window.devicePixelRatio || 1;
        const cssW = canvas.clientWidth || 600;
        const cssH = canvas.clientHeight || height;
        canvas.width = Math.floor(cssW * ratio);
        canvas.height = Math.floor(cssH * ratio);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(ratio, ratio);

        // bg
        ctx.clearRect(0, 0, cssW, cssH);
        ctx.fillStyle = "transparent";
        ctx.fillRect(0, 0, cssW, cssH);

        // grid
        ctx.strokeStyle = "#ffffff20";
        ctx.lineWidth = 1;
        ctx.beginPath();
        // center line
        ctx.moveTo(0, cssH / 2);
        ctx.lineTo(cssW, cssH / 2);
        // vertical quarters
        for (let i = 1; i < 4; i++) {
            const x = (i / 4) * cssW;
            ctx.moveTo(x, 0);
            ctx.lineTo(x, cssH);
        }
        // outer border drawn by CSS
        ctx.stroke();

        // waveform
        ctx.strokeStyle = getComputedStyle(document.body).color || "#22d3ee";
        ctx.lineWidth = 2;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.beginPath();
        const N = samples.length;
        for (let i = 0; i < N; i++) {
            const t = i / (N - 1);
            const x = t * cssW;
            const y = (1 - (samples[i] + 1) / 2) * cssH; // -1..1 => y
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }, [samples, height]);

    // interaction
    const updateAt = (clientX: number, clientY: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        const cssW = rect.width;
        const cssH = rect.height;
        const N = samples.length;
        let idx = Math.round((x / cssW) * (N - 1));
        idx = Math.max(0, Math.min(N - 1, idx));
        // map y to [-1, 1]
        const v = Math.max(-1, Math.min(1, 1 - (y / cssH) * 2));

        // paint with simple radial brush falloff
        const radius = Math.max(1, Math.floor(brush));
        const out = new Float32Array(samples);
        for (let di = -radius * 2; di <= radius * 2; di++) {
            const j = idx + di;
            if (j < 0 || j >= N) continue;
            const d = Math.abs(di) / (radius * 2);
            const w = Math.max(0, 1 - d); // linear falloff
            out[j] = clamp(lerp(out[j], v, w));
        }
        onChange(out);
    };

    const onPointerDown = (e: React.PointerEvent) => {
        (e.target as Element).setPointerCapture(e.pointerId);
        setDragging(true);
        updateAt(e.clientX, e.clientY);
    };
    const onPointerMove = (e: React.PointerEvent) => {
        if (!dragging) return;
        updateAt(e.clientX, e.clientY);
    };
    const onPointerUp = (e: React.PointerEvent) => {
        (e.target as Element).releasePointerCapture(e.pointerId);
        setDragging(false);
    };

    return (
        <div className="grid gap-2">
            <div className="text-sm opacity-80">Custom Waveform (draw one period)</div>
            <div
                className="w-full border rounded-md overflow-hidden"
                style={{ cursor: dragging ? "grabbing" : hovering ? "crosshair" : "default" }}>
                <canvas
                    ref={canvasRef}
                    className="w-full"
                    style={{ height }}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerEnter={() => setHovering(true)}
                    onPointerLeave={() => setHovering(false)}
                />
            </div>
            <div className="text-xs opacity-60">
                Tip: click-drag to sculpt. The cursor changes on hover; use small strokes for fine control.
            </div>
        </div>
    );
}

function clamp(v: number) {
    return Math.max(-1, Math.min(1, v));
}
function lerp(a: number, b: number, t: number) {
    return a + (b - a) * t;
}
