import React from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, ChevronRight } from 'lucide-react';
import DashboardCard from './DashboardCard';
import { useDashboard } from '../../context/DashboardContext';

const MiniBar: React.FC<{ label: string; value: number; color?: string }> = ({ label, value, color = '#22c55e' }) => (
  <div>
    <div className="flex justify-between text-[8px] font-mono-data text-slate-500 mb-1">
      <span>{label}</span>
      <span>{Number.isFinite(value) ? `${Math.round(value)}%` : '—'}</span>
    </div>
    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, Math.max(0, value || 0))}%`, backgroundColor: color }} />
    </div>
  </div>
);

const Spark: React.FC<{ points: number[]; color?: string }> = ({ points, color = '#22c55e' }) => {
  if (!points.length) return <p className="text-[9px] font-mono-data text-slate-600 py-4 text-center">No telemetry</p>;
  const max = Math.max(...points, 1);
  const w = 120, h = 36;
  const d = points.map((v, i) => {
    const x = (i / Math.max(points.length - 1, 1)) * w;
    const y = h - (v / max) * (h - 4) - 2;
    return `${i === 0 ? 'M' : 'L'}${x},${y}`;
  }).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-9" preserveAspectRatio="none">
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
};

/** Inset panel — real mini charts embedded. Click → dedicated detail page (not /analytics). */
const CriticalChartAnalysis: React.FC = () => {
  const { data } = useDashboard();
  const navigate = useNavigate();
  const live = data?.live ?? {};
  const health = data?.health ?? {};
  const server = data?.server_health ?? {};
  const charts = data?.charts ?? {};
  const cpu = Number(live.cpu ?? health.avg_cpu ?? server.cpu ?? 0);
  const ram = Number(live.ram ?? health.avg_ram ?? server.memory ?? 0);
  const disk = Number(live.disk ?? server.disk ?? 0);
  const score = data?.security?.score;
  const alertTrend = (charts.alerts ?? charts.alert_trend ?? []).map((p: any) => Number(p.y ?? p.value ?? p.count ?? 0));
  const events = (data?.activity ?? data?.timeline ?? data?.alerts?.recent ?? []).slice(0, 4);

  return (
    <DashboardCard
      title="Critical Chart Analysis"
      subtitle="live inset previews · click for full detail page"
      icon={<BarChart3 size={18} />}
      accent="#22c55e"
      onClick={() => navigate('/chart-analysis')}
      className="aeyes-card--clickable"
      actions={
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); navigate('/chart-analysis'); }}
          className="flex items-center gap-1 text-[9px] font-orbitron uppercase tracking-widest text-green-400 hover:text-green-300"
        >
          Full detail <ChevronRight size={12} />
        </button>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* 1 — CPU / RAM / DISK (real meters) */}
        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 space-y-2">
          <p className="text-[8px] font-orbitron text-slate-500 tracking-widest uppercase">CPU / RAM / Disk</p>
          <MiniBar label="CPU" value={cpu} color="#22c55e" />
          <MiniBar label="RAM" value={ram} color="#4ade80" />
          <MiniBar label="Disk" value={disk} color="#86efac" />
        </div>

        {/* 2 — Security Score (real gauge) */}
        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 flex flex-col items-center justify-center">
          <p className="text-[8px] font-orbitron text-slate-500 tracking-widest uppercase mb-2 self-start">Security Score</p>
          {score == null ? (
            <p className="text-[9px] font-mono-data text-slate-600 py-4 text-center">Collecting telemetry…</p>
          ) : (
            <>
              <p className="text-4xl font-bold font-rajdhani text-white">
                {Math.round(score)}<span className="text-base text-slate-500">/100</span>
              </p>
              <p className="text-[9px] font-mono-data text-slate-500 mt-1">{data?.security?.status ?? data?.security?.grade ?? '—'}</p>
            </>
          )}
        </div>

        {/* 3 — Alert Trend (real sparkline) */}
        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
          <p className="text-[8px] font-orbitron text-slate-500 tracking-widest uppercase mb-2">Alert Trend</p>
          <Spark points={alertTrend} color="#ef4444" />
        </div>

        {/* 4 — Activity Timeline (real events) */}
        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
          <p className="text-[8px] font-orbitron text-slate-500 tracking-widest uppercase mb-2">Activity Timeline</p>
          <div className="space-y-1.5 max-h-20 overflow-hidden">
            {events.length === 0 && <p className="text-[9px] font-mono-data text-slate-600 text-center py-3">No events</p>}
            {events.map((e: any, i: number) => (
              <p key={i} className="text-[9px] font-mono-data text-slate-400 truncate">
                {e.message || e.title || e.event || 'event'}
              </p>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-[9px] font-orbitron tracking-[0.25em] uppercase text-green-500/70">
        Click panel → full chart detail page
      </p>
    </DashboardCard>
  );
};

export default CriticalChartAnalysis;