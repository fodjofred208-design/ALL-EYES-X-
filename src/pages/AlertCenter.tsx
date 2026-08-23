import React, { useState } from 'react';
import { ShieldAlert, Copy, Check, Filter } from 'lucide-react';
import { useDashboard } from '../context/DashboardContext';
import { relativeTime } from '../utils/format';

const SEV: Record<string, string> = {
  critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e', info: '#38bdf8',
};

const AlertCenter: React.FC = () => {
  const { data, loading } = useDashboard();
  const [filter, setFilter] = useState('all');
  const [copied, setCopied] = useState<string | null>(null);

  // Merge alerts from the dashboard payload
  const alerts = data?.alerts ?? { total: 0, recent: [] };
  const recent = Array.isArray(alerts.recent) ? alerts.recent : [];

  const counts = {
    all: alerts.total ?? recent.length,
    critical: alerts.critical ?? recent.filter((a: any) => String(a.severity).toLowerCase() === 'critical').length,
    high: alerts.high ?? recent.filter((a: any) => String(a.severity).toLowerCase() === 'high').length,
    medium: alerts.medium ?? recent.filter((a: any) => String(a.severity).toLowerCase() === 'medium').length,
    low: recent.filter((a: any) => {
      const s = String(a.severity).toLowerCase();
      return s === 'low' || s === 'info';
    }).length,
  };

  const filtered = filter === 'all' ? recent : recent.filter((a: any) => String(a.severity).toLowerCase() === filter);

  // Sort newest first
  filtered.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));

  const reportAlert = (a: any) => {
    const text =
      `ALL EYES X ALERT REPORT\n` +
      `Severity: ${String(a.severity).toUpperCase()}\n` +
      `Time: ${new Date(Number(a.timestamp || Date.now() / 1000) * 1000).toISOString()}\n` +
      `Message: ${a.message || a.title || 'N/A'}`;
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(a.id || 'copy');
    setTimeout(() => setCopied(null), 1600);
  };

  if (loading && !data) {
    return <div className="grid gap-3 md:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-28" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl md:text-3xl font-orbitron font-bold tracking-[0.3em] neon-text">ALERT CENTER</h1>
        <p className="mt-1 text-[10px] font-mono-data text-[#22c55e] tracking-[0.35em] uppercase">Detailed alert analysis · all severities</p>
        <div className="aeyes-divider mt-2 w-64 md:w-96" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { k: 'all', label: 'All Alerts', color: '#e2e8f0' },
          { k: 'critical', label: 'Critical', color: SEV.critical },
          { k: 'high', label: 'High', color: SEV.high },
          { k: 'medium', label: 'Medium', color: SEV.medium },
          { k: 'low', label: 'Low / Info', color: SEV.low },
        ].map(s => (
          <button
            key={s.k}
            type="button"
            onClick={() => setFilter(s.k)}
            className={`aeyes-card p-3 text-left ${filter === s.k ? 'border-green-500/40' : ''}`}
          >
            <p className="text-[8px] font-orbitron uppercase tracking-widest text-slate-500">{s.label}</p>
            <p className="text-2xl font-bold font-rajdhani mt-1" style={{ color: s.color }}>
              {(counts as any)[s.k] ?? 0}
            </p>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-[10px] font-mono-data text-slate-500 flex items-center gap-1">
          <Filter size={11} /> Showing: <span className="text-slate-300 uppercase">{filter}</span>
        </p>
      </div>

      <div className="aeyes-card p-4">
        {filtered.length === 0 && (
          <div className="py-12 text-center">
            <ShieldAlert size={28} className="mx-auto text-slate-700 mb-3" />
            <p className="text-[10px] font-orbitron text-slate-500 uppercase tracking-widest">
              {data ? 'No alerts to display' : 'Cannot reach intelligence engine'}
            </p>
          </div>
        )}

        <div className="space-y-2 max-h-[560px] overflow-y-auto aeyes-scroll pr-1">
          {filtered.map((a: any, i: number) => {
            const sev = String(a.severity || 'info').toLowerCase();
            const color = SEV[sev] || '#64748b';
            return (
              <div
                key={a.id || a.timestamp || i}
                className="aeyes-slide-in p-3 rounded-xl bg-white/[0.03] border-l-2 flex items-start gap-3"
                style={{ borderLeftColor: color, animationDelay: `${Math.min(i * 40, 400)}ms` }}
              >
                <span className="status-dot mt-1 shrink-0" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[9px] font-orbitron uppercase tracking-widest" style={{ color }}>{sev}</span>
                    <span className="text-[8px] font-mono-data text-slate-600">{relativeTime(a.timestamp)}</span>
                  </div>
                  <p className="text-[11px] font-mono-data text-slate-300 mt-1 break-words">{a.message || a.title || 'Alert event'}</p>
                </div>
                <button
                  type="button"
                  onClick={() => reportAlert(a)}
                  className="shrink-0 px-2 py-1 rounded-lg border border-white/10 text-[8px] font-orbitron uppercase tracking-widest text-slate-400 hover:text-green-300 hover:border-green-500/40 transition-all flex items-center gap-1"
                >
                  {copied === (a.id || 'copy') ? <Check size={10} /> : <Copy size={10} />}
                  {copied === (a.id || 'copy') ? 'Copied' : 'Report'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default AlertCenter;