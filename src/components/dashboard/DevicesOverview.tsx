import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Monitor, Cpu, Smartphone, Server, Router, Printer, Tablet } from 'lucide-react';
import DashboardCard from './DashboardCard';
import { useDashboard } from '../../context/DashboardContext';
import { relativeTime } from '../../utils/format';
import { computeDeviceTotals } from '../../utils/normalize';

const iconFor = (d: any) => {
  const os = String(d.os || d.os_name || '').toLowerCase();
  const host = String(d.hostname || '').toLowerCase();
  if (os.includes('android') || os.includes('ios') || /phone|mobile/.test(host)) return <Smartphone size={15} />;
  if (/router|gateway/.test(host)) return <Router size={15} />;
  if (/printer/.test(host)) return <Printer size={15} />;
  if (/tablet|ipad/.test(host)) return <Tablet size={15} />;
  if (/server|ubuntu|centos|debian|proxmox/.test(host + os)) return <Server size={15} />;
  return <Cpu size={15} />;
};

const DevicesOverview: React.FC = () => {
  const { data } = useDashboard();
  const navigate = useNavigate();
  const devTotals = computeDeviceTotals(data?.devices?.list ?? []);
  const devices = devTotals.list;

  return (
    <DashboardCard
      title="Connected Devices"
      subtitle="hostname · ip · os · cpu · status · last seen"
      icon={<Monitor size={18} />}
      accent="#22c55e"
      actions={
        <button
          type="button"
          onClick={() => navigate('/devices')}
          className="text-[9px] font-orbitron uppercase tracking-widest text-green-400 hover:text-green-300"
        >
          View all devices
        </button>
      }
    >
      {/* Fleet summary bar */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {[
          { label: 'Total', value: devTotals.total, color: '#e2e8f0' },
          { label: 'Online', value: devTotals.online, color: '#22c55e' },
          { label: 'Offline', value: devTotals.offline, color: '#64748b' },
        ].map(s => (
          <div key={s.label} className="rounded-lg border border-white/5 bg-white/[0.03] px-2 py-1.5 text-center">
            <p className="text-[8px] font-orbitron uppercase tracking-widest text-slate-500">{s.label}</p>
            <p className="text-lg font-bold font-rajdhani leading-tight" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="aeyes-scroll max-h-[330px] overflow-y-auto pr-1 space-y-2">
        {devices.map((d: any, i: number) => {
          const id = d.device_id ?? d.id;
          const online = String(d.status ?? '').toLowerCase() === 'online';
          const cpu = Number(d.telemetry?.cpu ?? d.cpu_usage ?? 0);
          const ram = Number(d.telemetry?.ram ?? 0);
          return (
            <div
              key={id ?? i}
              onClick={() => id && navigate(`/device/${id}`)}
              className="aeyes-devcard aeyes-rise p-3 pl-4 cursor-pointer"
              style={{
                animationDelay: `${Math.min(i * 40, 400)}ms`,
                ['--aeyes-accent' as any]: online ? '#22c55e' : '#475569',
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`relative p-2 rounded-lg shrink-0 ${online ? 'bg-green-500/10 text-green-400' : 'bg-slate-500/10 text-slate-500'}`}
                >
                  {iconFor(d)}
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-[#060812] ${
                      online ? 'bg-green-400 shadow-[0_0_6px_rgba(34,197,94,0.9)]' : 'bg-slate-600'
                    }`}
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-[12px] font-bold text-slate-100 truncate">{d.hostname || 'unknown'}</p>
                    <span
                      className={`text-[8px] font-orbitron px-1.5 py-0.5 rounded border ${
                        online
                          ? 'text-green-300 border-green-500/30 bg-green-500/10'
                          : 'text-slate-500 border-slate-600/40 bg-slate-500/10'
                      }`}
                    >
                      {online ? 'ONLINE' : 'OFFLINE'}
                    </span>
                  </div>
                  <p className="text-[10px] font-mono-data text-slate-500 truncate">
                    {d.ip || '—'} · {d.os || '—'}
                  </p>
                </div>

                <div className="hidden sm:block text-right shrink-0">
                  <p className="text-[9px] font-mono-data text-slate-500">{relativeTime(d.last_seen)}</p>
                  {(cpu > 0 || ram > 0) && (
                    <p className="text-[9px] font-mono-data text-slate-600">
                      cpu {Math.round(cpu)}% · ram {Math.round(ram)}%
                    </p>
                  )}
                </div>
              </div>

              {/* live utilisation bars — only when real telemetry exists */}
              {(cpu > 0 || ram > 0) && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {[
                    { l: 'CPU', v: cpu, c: '#22c55e' },
                    { l: 'RAM', v: ram, c: '#4ade80' },
                  ].map(m => (
                    <div key={m.l}>
                      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${Math.min(100, Math.max(0, m.v))}%`, background: m.c }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {devices.length === 0 && (
          <div className="py-8 text-center text-[10px] text-slate-600 font-mono-data">
            No devices registered — clients appear after first heartbeat
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between text-[9px] font-mono-data text-slate-600">
        <span>{devTotals.total} total · {devTotals.online} online · {devTotals.offline} offline</span>
        <span>click a card for full device detail</span>
      </div>
    </DashboardCard>
  );
};

export default DevicesOverview;
