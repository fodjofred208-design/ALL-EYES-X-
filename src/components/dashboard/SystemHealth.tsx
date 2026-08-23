import React from 'react';
import { Activity, Cpu, HardDrive, MemoryStick, Server } from 'lucide-react';
import DashboardCard from './DashboardCard';
import { useDashboard } from '../../context/DashboardContext';
import { formatBytes } from '../../utils/format';

const STATUS_COLORS: Record<string, string> = {
  ok: '#22c55e', healthy: '#22c55e', degraded: '#eab308',
  warning: '#f97316', down: '#ef4444', offline: '#ef4444', unknown: '#64748b',
};

const Meter: React.FC<{ label: string; value: number; color?: string; icon?: React.ReactNode }> = ({
  label, value, color = '#22c55e', icon,
}) => (
  <div>
    <div className="flex justify-between text-[10px] font-mono-data mb-1">
      <span className="text-slate-500 uppercase flex items-center gap-1">{icon}{label}</span>
      <span className="text-slate-300">{Math.round(value)}%</span>
    </div>
    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: color }} />
    </div>
  </div>
);

const SystemHealth: React.FC = () => {
  const { data } = useDashboard();
  const health = data?.health ?? {};
  const server = data?.server_health ?? {};
  const services = Array.isArray(health?.services) ? health.services : [];

  const cpu = Number(health?.avg_cpu ?? server?.cpu ?? 0);
  const ram = Number(health?.avg_ram ?? server?.memory ?? 0);
  const disk = Number(server?.disk ?? 0);
  const dbState = String(server?.db ?? server?.database ?? 'unknown').toLowerCase();
  const dbDown = dbState === 'offline' || dbState === 'down';

  return (
    <DashboardCard
      title="System Health"
      subtitle="server + fleet aggregate"
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

      <div className="space-y-3">
        <Meter label="Server CPU" value={cpu} color={cpu >= 80 ? '#ef4444' : cpu >= 60 ? '#f97316' : '#22c55e'} icon={<Cpu size={10} />} />
        <Meter label="Memory" value={ram} color={ram >= 80 ? '#ef4444' : ram >= 60 ? '#f97316' : '#4ade80'} icon={<MemoryStick size={10} />} />
        <Meter label="Disk" value={disk} color={disk >= 80 ? '#ef4444' : disk >= 60 ? '#f97316' : '#86efac'} icon={<HardDrive size={10} />} />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
          {[
            { label: 'Uptime', value: server?.uptime ?? health?.uptime ?? '—' },
            { label: 'Processes', value: server?.processes ?? '—' },
            { label: 'Threads', value: server?.threads ?? '—' },
            { label: 'DB Size', value: formatBytes(server?.db_size ?? 0) },
          ].map(s => (
            <div key={s.label} className="p-2 rounded-lg bg-white/5">
              <p className="text-[8px] font-orbitron text-slate-500 uppercase tracking-widest">{s.label}</p>
              <p className="text-[11px] font-mono-data mt-1 text-slate-300">{s.value}</p>
            </div>
          ))}
        </div>

        {services.length > 0 && (
          <div>
            <p className="text-[9px] font-orbitron text-slate-500 uppercase tracking-widest mb-2">Core Services</p>
            <div className="grid grid-cols-2 gap-2">
              {services.map((s: any) => {
                const st = String(s.status).toLowerCase();
                const cls =
                  st === 'ok' || st === 'healthy' ? 'status-online' :
                  st === 'degraded' || st === 'warning' ? 'status-warning' :
                  st === 'down' || st === 'offline' ? 'status-critical' : 'status-offline';
                return (
                  <div key={s.name} className="flex items-center gap-2 p-2 rounded-lg bg-white/5">
                    <span className={`status-dot ${cls}`} />
                    <span className="text-[9px] font-mono-data text-slate-300 truncate">{s.name}</span>
                    <span className="ml-auto text-[8px] font-orbitron uppercase" style={{ color: STATUS_COLORS[st] ?? '#94a3b8' }}>
                      {s.status}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 pt-1 border-t border-white/5">
          <Server size={10} className="text-slate-600" />
          <span className="text-[9px] font-mono-data text-slate-600">
            Sampled via telemetry · thresholds 60% / 80%
          </span>
        </div>
      </div>
    </DashboardCard>
  );
};

export default SystemHealth;