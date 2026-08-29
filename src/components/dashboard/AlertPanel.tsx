import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import DashboardCard from './DashboardCard';
import { useDashboard } from '../../context/DashboardContext';
import { API_BASE } from '../../utils/api';
import { formatTime } from '../../utils/format';

const SEV = ['all', 'critical', 'high', 'medium', 'low', 'info'] as const;
const SEV_COLORS: Record<string, string> = {
  critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#00d4ff', info: '#64748b',
};

const AlertPanel: React.FC = () => {
  const { data, refresh } = useDashboard();
  const [filter, setFilter] = useState<string>('all');
  const alerts = (data?.alerts?.recent ?? []).filter((a: any) => filter === 'all' || a.severity === filter);

  const resolve = async (id: number) => {
    try {
      await fetch(`${API_BASE}/api/alerts/${id}/resolve`, { method: 'POST', credentials: 'include' });
      refresh();
    } catch {
      /* ignore network errors */
    }
  };

  return (
    <DashboardCard
      title="Alert Center"
      subtitle="filterable · auto-refreshing"
      icon={<AlertTriangle size={18} />}
      accent="#ef4444"
      actions={
        <div className="flex gap-1 flex-wrap justify-end">
          {SEV.map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-2 py-0.5 rounded text-[8px] font-orbitron uppercase tracking-wider transition-colors ${
                filter === s ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      }
    >
      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {alerts.map((a: any, i: number) => (
          <div key={a.id} className="aeyes-slide-in p-3 rounded-xl bg-white/5 border-l-2" style={{ borderLeftColor: SEV_COLORS[a.severity] ?? '#64748b', animationDelay: `${Math.min(i * 60, 400)}ms` }}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-orbitron uppercase tracking-widest" style={{ color: SEV_COLORS[a.severity] ?? '#64748b' }}>
                {a.severity}
              </span>
              <span className="text-[9px] font-mono-data text-slate-500">{formatTime(a.timestamp)}</span>
            </div>
            <p className="text-[12px] font-rajdhani text-white mt-1">{a.title || a.message}</p>
            <p className="text-[10px] font-mono-data text-slate-400 mt-0.5 truncate">{a.description || a.message}</p>
            <div className="flex items-center justify-between mt-2">
              <span className="text-[9px] font-mono-data text-slate-500">{a.hostname || 'server'} · {a.category}</span>
              <div className="flex items-center gap-2">
                <span className={`text-[9px] font-orbitron uppercase ${a.status === 'open' ? 'text-red-400' : 'text-green-500'}`}>
                  {a.status}
                </span>
                {a.status === 'open' && (
                  <button
                    onClick={() => resolve(a.id)}
                    className="text-[9px] font-orbitron text-slate-400 hover:text-green-400 transition-colors"
                  >
                    RESOLVE
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
        {alerts.length === 0 && (
          <p className="text-center text-[10px] text-slate-600 font-mono-data py-6">
            No alerts{filter !== 'all' ? ` (${filter})` : ''}
          </p>
        )}
      </div>
    </DashboardCard>
  );
};

export default AlertPanel;