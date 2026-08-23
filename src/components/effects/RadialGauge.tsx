import React from 'react';
import AnimatedNumber from './AnimatedNumber';

interface Props {
  value: number;          // 0–100
  size?: number;
  stroke?: number;
  color?: string;
  label?: string;
  sublabel?: string;
}

const RadialGauge: React.FC<Props> = ({
  value, size = 130, stroke = 9, color = '#00ff88', label = '', sublabel = '',
}) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, value));
  const offset = c - (clamped / 100) * c;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="aeyes-gauge-track" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke}
          stroke={color} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
          className="aeyes-gauge-value"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <AnimatedNumber value={clamped} suffix="%" className="text-xl font-bold font-rajdhani" />
        {label && <span className="text-[8px] font-orbitron uppercase tracking-widest text-slate-500">{label}</span>}
        {sublabel && <span className="text-[8px] font-mono-data text-slate-600">{sublabel}</span>}
      </div>
    </div>
  );
};

export default RadialGauge;