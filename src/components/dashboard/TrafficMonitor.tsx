import React from 'react';
import { Activity, Crown, Target } from 'lucide-react';
import DashboardCard from './DashboardCard';
import { useDashboard } from '../../context/DashboardContext';
import { formatBytes, formatBitsPerSec } from '../../utils/format';

const TrafficMonitor: React.FC = () => {
  const { data } = useDashboard();
  const t = data?.traffic;
  const dl = (t?.download ?? 0) * 8;
  const ul = (t?.upload ?? 0) * 8;
  const max = Math.max(dl, ul, 1);
  return (
    <DashboardCard title="Network Traffic Monitor" subtitle="live bandwidth · heartbeat sampling" icon={<Activity size={18} />} accent="#00d4ff">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="flex justify-between text-[10px] font-mono-data mb-1">
              <span className="text-slate-500 uppercase">Download</span>
              <span className="text-cyan-400">{formatBitsPerSec(dl)}</span>
            </div>
            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full transition-all duration-700" style={{ width: `${(dl / max) * 100}%`, background: 'linear-gradient(90deg, #00ff88, #00cc6a)', boxShadow: '0 0 12px rgba(0,255,136,0.6)' }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-[10px] font-mono-data mb-1">
              <span className="text-slate-500 uppercase">Upload</span>
              <span className="text-green-400">{formatBitsPerSec(ul)}</span>
            </div>
            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full transition-all duration-700" style={{ width: `${(ul / max) * 100}%`, background: 'linear-gradient(90deg, #34d399, #059669)', boxShadow: '0 0 12px rgba(52,211,153,0.6)' }} />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
          {[
            { label: 'AVG DL', value: formatBitsPerSec((t?.avg_download ?? 0) * 8), color: '#00d4ff' },
            { label: 'AVG UL', value: formatBitsPerSec((t?.avg_upload ?? 0) * 8), color: '#22c55e' },
            { label: 'PEAK', value: formatBitsPerSec((t?.peak ?? 0) * 8), color: '#eab308' },
            { label: 'TOTAL', value: formatBytes(t?.total_bytes ?? 0), color: '#8b5cf6' },
          ].map(s => (
            <div key={s.label} className="p-2 rounded-lg bg-white/5">
              <p className="text-[8px] font-orbitron text-slate-500 uppercase tracking-widest">{s.label}</p>
              <p className="text-[11px] font-mono-data mt-1" style={{ color: s.color }}>{s.value}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-xl bg-cyan-500/5 border border-cyan-500/10">
            <div className="flex items-center gap-2 mb-1">
              <Crown size={12} className="text-cyan-400" />
              <span className="text-[9px] font-orbitron text-slate-400 uppercase tracking-widest">Most Active</span>
            </div>
            <p className="text-[12px] font-rajdhani text-white truncate">{t?.most_active_device?.hostname ?? '—'}</p>
          </div>
          <div className="p-3 rounded-xl bg-purple-500/5 border border-purple-500/10">
            <div className="flex items-center gap-2 mb-1">
              <Target size={12} className="text-purple-400" />
              <span className="text-[9px] font-orbitron text-slate-400 uppercase tracking-widest">Top Consumer</span>
            </div>
            <p className="text-[12px] font-rajdhani text-white truncate">{t?.top_consumer?.hostname ?? '—'}</p>
          </div>
        </div>
      </div>
    </DashboardCard>
  );
};
export default TrafficMonitor;