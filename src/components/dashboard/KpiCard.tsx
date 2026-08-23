import React from 'react';

interface Props {
  label: string;
  value: number | string;
  sub?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  accent?: string;
  variant?: 'green' | 'ghost';
  delay?: number;
}

const KpiCard: React.FC<Props> = ({
  label, value, sub, icon, onClick, accent = '#22c55e', variant = 'green', delay = 0,
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={!onClick}
    className={`aeyes-card aeyes-kpi ${variant === 'ghost' ? 'aeyes-card--ghost' : ''} ${onClick ? 'aeyes-card--clickable' : ''} aeyes-rise text-left w-full p-4`}
    style={{ animationDelay: `${delay}ms` }}
  >
    <div className="flex items-center justify-between mb-2">
      <span className="text-[9px] font-orbitron uppercase tracking-[0.2em] text-slate-400">{label}</span>
      {icon && <span style={{ color: accent }}>{icon}</span>}
    </div>
    <p className="text-3xl font-bold font-rajdhani leading-none text-white" style={{ textShadow: `0 0 20px ${accent}44` }}>
      {value}
    </p>
    {sub && <p className="mt-1.5 text-[9px] font-mono-data text-slate-500 truncate">{sub}</p>}
  </button>
);

export default KpiCard;