import React from 'react';
import { Activity } from 'lucide-react';
import DashboardCard from './DashboardCard';
import { useDashboard } from '../../context/DashboardContext';
import { computeDeviceTotals } from '../../utils/normalize';

const LEVEL_COLORS: Record<string, string> = {
  LOW: '#22c55e', MEDIUM: '#eab308', HIGH: '#f97316', CRITICAL: '#ef4444',
};

/** Inset panel — fully self-contained. No navigation. */
const DevicesStatsPanel: React.FC = () => {
  const { data } = useDashboard();
  const live = data?.live ?? {};
  const health = data?.health ?? {};
  const server = data?.server_health ?? {};
  const dev = data?.devices?.list?.length
    ? computeDeviceTotals(data.devices.list)
    : { total: data?.devices?.total ?? 0, online: data?.devices?.online ?? 0, offline: data?.devices?.offline ?? 0, list: [] };

  const ranking = computeDeviceTotals(data?.devices?.list ?? []).list
    .slice()
    .sort((a: any, b: any) => b.risk - a.risk)
    .slice(0, 3);

  const cpu = Number(live.cpu ?? health.avg_cpu ?? server.cpu ?? 0);
  const ram = Number(live.ram ?? health.avg_ram ?? server.memory ?? 0);
  const disk = Number(live.disk ?? server.disk ?? 0);
  const healthPct = Math.round(Math.max(0, 100 - (cpu * 0.35 + ram * 0.35 + disk * 0.3)));
  const onlinePct = dev.total > 0 ? (dev.online / dev.total) * 100 : 0;
  const dbRaw = String(server.db ?? server.database ?? '').toLowerCase();
  const dbDown = dbRaw === 'offline' || dbRaw === 'down';

  return (
    <DashboardCard
      title="Devices Stats"
      subtitle="live system · risk · online/offline · health"
      icon={<Activity size={18} />}
      accent="#22c55e"
      variant="ghost"
      className={dbDown ? 'aeyes-critical' : ''}
    >
      {dbDown && (
        <div className="mb-3 px-2 py-1.5 rounded-lg border border-red-500/40 bg-red-500/10 text-[9px] font-orbitron text-red-400 tracking-widest uppercase">
          Database offline
        </div>
      )}

      <div className="space-y-4">
        {/* Live System Stats */}
        <div>
          <p className="text-[8px] font-orbitron text-slate-500 tracking-widest uppercase mb-2">Live System Stats</p>
          {[
            { l: 'CPU', v: cpu, c: '#22c55e' },
            { l: 'RAM', v: ram, c: '#4ade80' },
            { l: 'Disk', v: disk, c: '#86efac' },
          ].map(m => (
            <div key={m.l} className="mb-1.5">
              <div className="flex justify-between text-[9px] font-mono-data text-slate-400 mb-0.5">
                <span>{m.l}</span><span>{Math.round(m.v)}%</span>
              </div>
              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full transition-all duration-700" style={{ width: `${Math.min(100, m.v)}%`, backgroundColor: m.c }} />
              </div>
            </div>
          ))}
        </div>

        {/* Device Risk Ranking */}
        <div>
          <p className="text-[8px] font-orbitron text-slate-500 tracking-widest uppercase mb-2">Device Risk Ranking</p>
          {ranking.length === 0 && <p className="text-[9px] font-mono-data text-slate-600">No risk data</p>}
          {ranking.map((d: any, i: number) => (
            <div key={d.device_id ?? i} className="flex items-center gap-2 py-1 text-[10px] font-mono-data">
              <span className="text-slate-600 w-4">{i + 1}.</span>
              <span className="flex-1 truncate text-slate-300">{d.hostname || d.device_id}</span>
              <span style={{ color: LEVEL_COLORS[d.risk_level] ?? '#64748b' }}>{d.risk_level}</span>
            </div>
          ))}
        </div>

        {/* Online vs Offline */}
        <div>
          <p className="text-[8px] font-orbitron text-slate-500 tracking-widest uppercase mb-2">Online vs Offline</p>
          <div className="h-2 rounded-full overflow-hidden flex bg-white/5">
            <div className="h-full bg-green-500 transition-all duration-700" style={{ width: `${onlinePct}%` }} />
            <div className="h-full bg-slate-600 transition-all duration-700" style={{ width: `${100 - onlinePct}%` }} />
          </div>
          <p className="mt-1 text-[9px] font-mono-data text-slate-500">{dev.online} online · {dev.offline} offline · {dev.total} total</p>
        </div>

        {/* System Health */}
        <div>
          <p className="text-[8px] font-orbitron text-slate-500 tracking-widest uppercase mb-2">System Health</p>
          <div className="h-2.5 bg-white/5 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 transition-all duration-1000" style={{ width: `${healthPct}%`, boxShadow: '0 0 12px rgba(34,197,94,0.35)' }} />
          </div>
          <p className="mt-1 text-[11px] font-rajdhani text-slate-300">{healthPct}%</p>
        </div>
      </div>
    </DashboardCard>
  );
};

export default DevicesStatsPanel;