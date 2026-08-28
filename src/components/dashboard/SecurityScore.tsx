import React from 'react';
import { ShieldCheck, ShieldAlert } from 'lucide-react';
import DashboardCard from './DashboardCard';
import RadialGauge from '../effects/RadialGauge';
import { useDashboard } from '../../context/DashboardContext';

const scoreColor = (s: number) =>
  s >= 80 ? '#22c55e' : s >= 60 ? '#eab308' : s >= 40 ? '#f97316' : '#ef4444';

const SecurityScore: React.FC = () => {
  const { data, loading, scopeDeviceId } = useDashboard();
  const sec = data?.security;
  const score = sec?.score == null ? null : Math.round(Number(sec.score) || 0);
  const color = score == null ? '#475569' : scoreColor(score);
  const factors = sec?.risk_factors ?? sec?.factors ?? [];
  const grade = sec?.status || sec?.grade || (score == null ? 'Collecting' : score >= 80 ? 'Good' : score >= 60 ? 'Fair' : score >= 40 ? 'Elevated' : 'Critical');

  return (
    <DashboardCard
      title="Security Score"
      subtitle={`${grade} · ${scopeDeviceId ? 'single device' : 'whole system'} · ${sec?.telemetry_devices ?? 0} reporting`}
      icon={<ShieldAlert size={18} />}
      accent={color}
      /* Compact: panel height follows its content instead of a fixed 40 rows. */
      className="aeyes-card--compact"
    >
      {loading && !data ? (
        <p className="text-[10px] font-mono-data text-slate-500 py-4 text-center">Collecting telemetry…</p>
      ) : score == null ? (
        <p className="text-[10px] font-mono-data text-slate-500 py-4 text-center">
          {sec ? 'Waiting for agent telemetry' : 'Telemetry unavailable'}
        </p>
      ) : (
        <div className="flex items-center gap-4">
          <RadialGauge value={score} size={96} stroke={8} color={color} label="/100" sublabel={String(grade)} />
          <div className="flex-1 space-y-1 min-w-0">
            {factors.slice(0, 5).map((f: any, i: number) => (
              <div key={i} className="flex items-center gap-2 text-[9px] font-mono-data">
                <span className={Number(f.impact) > 0 ? 'text-green-500' : Number(f.impact) < 0 ? 'text-red-500' : 'text-slate-600'}>
                  {Number(f.impact) > 0 ? '+' : ''}{f.impact}
                </span>
                <span className="text-slate-400 truncate">{f.label}</span>
              </div>
            ))}
            {factors.length === 0 && (
              <p className="text-[9px] font-mono-data text-slate-600">No risk factors reported</p>
            )}
          </div>
        </div>
      )}
    </DashboardCard>
  );
};

export default SecurityScore;
