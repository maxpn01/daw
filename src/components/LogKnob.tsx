"use client";
import Knob from "./Knob";

type Props = {
  label: string;
  value: number; // actual value (e.g., Hz)
  onChange: (v: number) => void;
  min?: number; // default 20
  max?: number; // default 20000
  format?: (v: number) => string;
};

export default function LogKnob({ label, value, onChange, min = 20, max = 20000, format }: Props) {
  const toNorm = (v: number) => {
    const clamped = Math.max(min, Math.min(max, v));
    const ratio = Math.log(clamped / min) / Math.log(max / min);
    return isFinite(ratio) ? ratio : 0;
  };
  const fromNorm = (t: number) => {
    const v = min * Math.pow(max / min, t);
    return Math.max(min, Math.min(max, v));
  };
  const norm = toNorm(value);
  return (
    <Knob
      label={label}
      value={norm}
      min={0}
      max={1}
      step={0.005}
      onChange={(t) => onChange(fromNorm(t))}
      format={(t) => (format ? format(fromNorm(t)) : `${Math.round(fromNorm(t))} Hz`)}
    />
  );
}

