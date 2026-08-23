import React, { useEffect, useState } from 'react';
import { Radio } from 'lucide-react';
import DashboardCard from './DashboardCard';
import AnimatedNumber from '../effects/AnimatedNumber';
import { useDashboard } from '../../context/DashboardContext';

const LiveStats: React.FC = () => {
  const { data, lastUpdated } = useDashboard();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(v => v + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const l = data?.live ?? {};
  const since = lastUpdated ? Math.floor((Date.now() - lastUpdated) / 1000) : 0;
  const stats = [
    { label: 'CPU', value: `${Math.round(l.cpu ?? data?.server_health?.cpu ?? 0)}%`, color: '#00d4ff' },
    { label: 'RAM', value: `${Math.round(l.ram ?? data?.server_health?.memory ?? 0)}%`, color: '#8b5cf6' },
    { label: 'UPTIME', value: l.uptime ?? data?.footer?.uptime ?? '—', color: '#22c55e' },
    { label: 'SOCKETS', value: l.active_sockets ?? data?.devices?.online ?? 0, color: '#eab308' },
    { label: 'API CALLS', value: l.api_requests ?? '—', color: '#f97316' },
    { label: 'SYNC', value: `${since}s`, color: '#ef4444' },
  ];

  return (
    <DashboardCard title="Live System Stats" subtitle="engine telemetry · streaming" icon={<Radio size={18} />} accent="#ef4444">
      <div className="grid grid-cols-3 gap-2">
        {stats.map(s => (
          <div key={s.label} className="p-2 rounded-lg bg-white/5 text-center">
            <p className="text-[8px] font-orbitron text-slate-500 uppercase tracking-widest">{s.label}</p>
            <p className="text-[13px] font-mono-data mt-1" style={{ color: s.color }}>
              <AnimatedNumber
                value={Number(String(s.value).replace(/[^\d.-]/g, '')) || 0}
                suffix={String(s.value).replace(/^[\d.\s-]*/, '')}
                duration={700}
              />
            </p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
        <span className="text-[9px] font-mono-data text-slate-500">Live feed · refreshed every 5s · tick {tick}</span>
      </div>
    </DashboardCard>
  );
};

export default LiveStats;