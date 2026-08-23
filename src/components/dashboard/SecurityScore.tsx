import React from 'react';
import { ShieldCheck, ShieldAlert } from 'lucide-react';
import DashboardCard from './DashboardCard';
import RadialGauge from '../effects/RadialGauge';
import { useDashboard } from '../../context/DashboardContext';

const scoreColor = (s: number) =>
  s >= 80 ? '#22c55e' : s >= 60 ? '#eab308' : s >= 40 ? '#f97316' : '#ef4444';

const SecurityScore: React.FC = () => {
  const { data, loading } = useDashboard();
  const sec = data?.security;

  if (loading && !data) {
    return (
      <DashboardCard title="Security Score" subtitle="engine assessment" icon={<ShieldCheck size={18} />} accent="#22c55e">
        <div className="h-40 flex items-center justify-center">
          <p className="text-[10px] font-mono-data text-slate-500">Collecting telemetry…</p>
        </div>
      </DashboardCard>
    );
  }

  if (!sec || sec.score == null) {
    return (
      <DashboardCard title="Security Score" subtitle="engine assessment" icon={<ShieldCheck size={18} />} accent="#22c55e">
        <div className="h-40 flex items-center justify-center">
          <p className="text-[10px] font-mono-data text-slate-500">
            {sec ? 'Collecting telemetry…' : 'Telemetry unavailable'}
          </p>
        </div>
      </DashboardCard>
    );
  }

  const score = Math.round(Number(sec.score) || 0);
  const color = scoreColor(score);
  const factors = sec.risk_factors ?? [];
  const grade = sec.status || sec.grade || (score >= 80 ? 'Good' : score >= 60 ? 'Fair' : score >= 40 ? 'Elevated' : 'Critical');

  return (
    <DashboardCard
      title="Security Score"
      subtitle={`${grade} · engine v${data?.version ?? '—'}`}
      icon={<ShieldAlert size={18} />}
      accent={color}
    >
      <div className="flex items-center gap-4">
        <RadialGauge value={score} size={124} stroke={9} color={color} label="/100" sublabel={String(grade)} />
        <div className="flex-1 space-y-1.5 min-w-0">
          {factors.slice(0, 6).map((f: any, i: number) => (
            <div key={i} className="flex items-center gap-2 text-[10px] font-mono-data">
              <span className={Number(f.impact) > 0 ? 'text-green-500' : 'text-red-500'}>
                {Number(f.impact) > 0 ? '+' : ''}{f.impact}
              </span>
              <span className="text-slate-400 truncate">{f.label}</span>
            </div>
          ))}
          {factors.length === 0 && (
            <p className="text-[10px] font-mono-data text-slate-600">No risk factors reported</p>
          )}
        </div>
      </div>
    </DashboardCard>
  );
};

export default SecurityScore;