import React from 'react';
import { ShieldAlert } from 'lucide-react';
import DashboardCard from './DashboardCard';
import { useDashboard } from '../../context/DashboardContext';

const LEVELS = [
  { label: 'LOW', max: 24, color: '#22c55e', msg: 'System operating normally' },
  { label: 'MEDIUM', max: 49, color: '#eab308', msg: 'Elevated security activity detected' },
  { label: 'HIGH', max: 74, color: '#f97316', msg: 'Significant threat indicators present' },
  { label: 'CRITICAL', max: 100, color: '#ef4444', msg: 'Immediate attention required' },
];

/** Threat rises with alerts/risk — NOT with security score (score is inverted). */
function computeThreat(data: any): number {
  if (data?.threat?.score != null) return Math.round(Number(data.threat.score));
  if (data?.threat?.level) {
    const map: Record<string, number> = { LOW: 15, MEDIUM: 35, HIGH: 60, CRITICAL: 90 };
    return map[String(data.threat.level).toUpperCase()] ?? 0;
  }
  const a = data?.alerts ?? {};
  const crit = Number(a.critical ?? 0);
  const high = Number(a.high ?? 0);
  const med = Number(a.medium ?? 0);
  const open = Number(a.total ?? 0);
  const offline = Number(data?.devices?.offline ?? 0);
  const total = Math.max(Number(data?.devices?.total ?? 1), 1);
  const topRisk = Math.max(0, ...((data?.devices?.list ?? data?.risk_ranking ?? []).map((d: any) => Number(d.risk ?? 0))));
  const failed = Number(data?.auth?.failed_today ?? 0);
  const brute = Number(data?.auth?.brute_force_attempts ?? 0);

  let score = 0;
  score += Math.min(40, crit * 18);
  score += Math.min(25, high * 8);
  score += Math.min(12, med * 3);
  score += Math.min(10, open * 1.2);
  score += Math.min(12, (offline / total) * 30);
  score += Math.min(15, topRisk * 0.15);
  score += Math.min(10, failed * 0.8 + brute * 4);
  return Math.max(0, Math.min(100, Math.round(score)));
}

const ThreatLevel: React.FC = () => {
  const { data, loading } = useDashboard();

  if (loading && !data) {
    return (
      <DashboardCard title="Threat Level" subtitle="intelligence engine" icon={<ShieldAlert size={18} />} accent="#22c55e">
        <div className="h-40 flex items-center justify-center">
          <p className="text-[10px] font-mono-data text-slate-500">Collecting telemetry…</p>
        </div>
      </DashboardCard>
    );
  }

  if (!data) {
    return (
      <DashboardCard title="Threat Level" subtitle="intelligence engine" icon={<ShieldAlert size={18} />} accent="#64748b">
        <div className="h-40 flex items-center justify-center">
          <p className="text-[10px] font-mono-data text-slate-500">Telemetry unavailable</p>
        </div>
      </DashboardCard>
    );
  }

  const value = computeThreat(data);
  const level = LEVELS.find(l => value <= l.max) ?? LEVELS[LEVELS.length - 1];
  const isHigh = value >= 50;
  const isCrit = value >= 75;

  return (
    <DashboardCard
      title="Threat Level"
      subtitle="computed from live security events"
      icon={<ShieldAlert size={18} />}
      accent={level.color}
      className={isCrit ? 'aeyes-critical' : isHigh ? 'aeyes-warning-glow' : ''}
    >
      <div className="text-center mb-3">
        <span
          className={`text-3xl font-bold font-rajdhani tracking-wider ${isHigh ? 'animate-pulse' : ''}`}
          style={{ color: level.color, textShadow: `0 0 28px ${level.color}88` }}
        >
          {level.label}
        </span>
        <p className="text-[10px] font-mono-data text-slate-400 mt-2 flex items-center justify-center gap-2">
          <span className="status-dot" style={{ background: level.color, boxShadow: `0 0 8px ${level.color}` }} />
          {level.msg}
        </p>
        <p className="text-[9px] font-mono-data text-slate-600 mt-1">THREAT INDEX {value}/100</p>
      </div>
      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${value}%`, backgroundColor: level.color }} />
      </div>
      <div className="flex justify-between mt-2">
        {LEVELS.map(l => (
          <span key={l.label} className="text-[8px] font-orbitron tracking-wider" style={{ color: value <= l.max && value > (LEVELS[LEVELS.indexOf(l) - 1]?.max ?? -1) ? l.color : '#334155' }}>
            {l.label}
          </span>
        ))}
      </div>
    </DashboardCard>
  );
};

export default ThreatLevel;