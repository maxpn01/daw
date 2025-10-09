"use client";
import { useCallback, useMemo, useRef, useState } from "react";

type Props = {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  size?: number; // px
  format?: (v: number) => string;
};

export default function Knob({ label, value, onChange, min = 0, max = 1, step = 0.01, size = 56, format }: Props) {
  const [dragging, setDragging] = useState(false);
  const startVal = useRef(0);
  const lastY = useRef(0);

  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const quantize = (v: number) => Math.round(v / step) * step;

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    setDragging(true);
    startVal.current = value;
    lastY.current = e.clientY;
  }, [value]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    const dy = e.clientY - lastY.current;
    lastY.current = e.clientY;
    // Sensitivity: 200 px for full range
    const delta = -dy * ((max - min) / 200);
    const next = quantize(clamp(startVal.current + delta));
    startVal.current = next; // accumulate
    onChange(next);
  }, [dragging, max, min, onChange, quantize]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    (e.target as Element).releasePointerCapture(e.pointerId);
    setDragging(false);
  }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const dir = e.deltaY > 0 ? -1 : 1;
    const next = quantize(clamp(value + dir * step));
    onChange(next);
  }, [clamp, onChange, quantize, step, value]);

  const pct = useMemo(() => (value - min) / (max - min), [value, min, max]);
  const angle = useMemo(() => -135 + pct * 270, [pct]);

  return (
    <div className="flex flex-col items-center select-none" style={{ width: size }}>
      <div
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
        className={`relative rounded-full border bg-neutral-900 flex items-center justify-center ${dragging ? "ring-2 ring-cyan-400" : ""}`}
        style={{ width: size, height: size }}
      >
        {/* Dial mark */}
        <div
          className="absolute"
          style={{
            width: size * 0.06,
            height: size * 0.28,
            top: size * 0.12,
            borderRadius: size * 0.03,
            background: "currentColor",
            transform: `rotate(${angle}deg)`,
            transformOrigin: `50% ${size * 0.36}px`,
          }}
        />
        {/* Center dot */}
        <div className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      </div>
      <div className="text-xs mt-2 text-center leading-tight">
        <div className="opacity-70">{label}</div>
        <div className="font-mono">{format ? format(value) : value.toFixed(Math.max(0, -Math.floor(Math.log10(step))))}</div>
      </div>
    </div>
  );
}

