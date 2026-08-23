import React from 'react';
import { AlertTriangle, KeyRound, MonitorUp, Wifi } from 'lucide-react';
import DashboardCard from './DashboardCard';
import { useDashboard } from '../../context/DashboardContext';
import { relativeTime } from '../../utils/format';

const SEV_COLORS: Record<string, string> = {
  critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#00d4ff', info: '#64748b',
};

interface Event {
  id: string;
  ts: string;
  kind: string;
  title: string;
  detail: string;
  color: string;
}

const ActivityTimeline: React.FC = () => {
  const { data } = useDashboard();
  const events: Event[] = [];

  (data?.alerts?.recent ?? []).forEach((a: any) => {
    events.push({
      id: `a${a.id}`,
      ts: a.timestamp,
      kind: 'alert',
      title: a.title || a.message || 'Alert',
      detail: `${a.severity} · ${a.hostname || 'server'}`,
      color: SEV_COLORS[a.severity] ?? '#64748b',
    });
  });
  (data?.auth?.recent ?? []).forEach((at: any, i: number) => {
    events.push({
      id: `l${i}`,
      ts: at.timestamp,
      kind: at.success ? 'login-ok' : 'login-fail',
      title: at.success ? 'Login successful' : 'Login failed',
      detail: `${at.username || 'unknown'} · ${at.ip || '—'}`,
      color: at.success ? '#22c55e' : '#ef4444',
    });
  });
  events.sort((a, b) => (a.ts > b.ts ? -1 : 1));

  const iconFor = (kind: string) => {
    switch (kind) {
      case 'alert': return <AlertTriangle size={12} />;
      case 'login-ok':
      case 'login-fail': return <KeyRound size={12} />;
      default: return <Wifi size={12} />;
    }
  };

  return (
    <DashboardCard title="Activity Timeline" subtitle="alerts + authentication events" icon={<MonitorUp size={18} />} accent="#00d4ff">
      <div className="relative pl-4 space-y-3 max-h-80 overflow-y-auto pr-1">
        <div className="absolute left-[5px] top-1 bottom-1 w-px bg-white/5" />
        {events.slice(0, 20).map((e, i) => (
          <div key={i} className="aeyes-slide-in relative" style={{ animationDelay: `${Math.min(i * 50, 450)}ms` }}>
            <span
              className="absolute -left-4 top-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#0a0e1a]"
              style={{ backgroundColor: e.color }}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-rajdhani text-slate-200 truncate flex items-center gap-1.5">
                {iconFor(e.kind)}
                {e.title}
              </span>
              <span className="text-[9px] font-mono-data text-slate-600 shrink-0">{relativeTime(e.ts)}</span>
            </div>
            <p className="text-[9px] font-mono-data text-slate-500 truncate">{e.detail}</p>
          </div>
        ))}
        {events.length === 0 && (
          <p className="text-[10px] font-mono-data text-slate-600 py-4 text-center">No activity yet</p>
        )}
      </div>
    </DashboardCard>
  );
};

export default ActivityTimeline;