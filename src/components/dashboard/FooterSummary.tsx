import React from 'react';
import { ShieldCheck, Database, Cpu, Clock } from 'lucide-react';
import { useDashboard } from '../../context/DashboardContext';

const FooterSummary: React.FC = () => {
  const { data } = useDashboard();
  const server = data?.server_health ?? {};
  const dbRaw = String(server.db ?? server.database ?? 'unknown').toLowerCase();
  const dbOk = dbRaw === 'ok' || dbRaw === 'healthy' || dbRaw === 'online';
  const version = data?.version ?? '—';
  const uptime = server?.uptime ?? '—';
  const serverTime = data?.server_time ?? '—';
  const total = data?.devices?.total ?? 0;
  const online = data?.devices?.online ?? 0;
  const engine = data?.engine ?? (data ? 'engine online' : 'engine —');

  const footer = data?.footer;
  const footerMsg =
    typeof footer === 'string' ? footer :
    footer && typeof footer === 'object'
      ? String((footer as any).message ?? (footer as any).text ?? '')
      : '';

  return (
    <div className="aeyes-card aeyes-card--ghost p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <ShieldCheck size={14} className="text-[#22c55e] shrink-0" />
        <div className="min-w-0">
          <p className="text-[9px] font-orbitron uppercase tracking-widest text-slate-300">ALL EYES X</p>
          <p className="text-[8px] font-mono-data text-slate-500 truncate">v{version} · {String(engine)}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 min-w-0">
        <Database size={14} className={`shrink-0 ${dbOk ? 'text-[#22c55e]' : 'text-red-400'}`} />
        <div className="min-w-0">
          <p className="text-[9px] font-orbitron uppercase tracking-widest text-slate-300">Database</p>
          <p className={`text-[8px] font-mono-data truncate ${dbOk ? 'text-green-500' : 'text-red-400'}`}>
            {dbOk ? 'online' : dbRaw === 'unknown' ? 'unknown' : 'offline'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 min-w-0">
        <Cpu size={14} className="text-[#22c55e] shrink-0" />
        <div className="min-w-0">
          <p className="text-[9px] font-orbitron uppercase tracking-widest text-slate-300">Fleet</p>
          <p className="text-[8px] font-mono-data text-slate-500 truncate">{online}/{total} online</p>
        </div>
      </div>

      <div className="flex items-center gap-2 min-w-0">
        <Clock size={14} className="text-[#22c55e] shrink-0" />
        <div className="min-w-0">
          <p className="text-[9px] font-orbitron uppercase tracking-widest text-slate-300">Uptime</p>
          <p className="text-[8px] font-mono-data text-slate-500 truncate">{uptime} · {serverTime}</p>
        </div>
      </div>

      {footerMsg && (
        <div className="md:col-span-4 border-t border-white/5 pt-2 text-[8px] font-mono-data text-slate-600">
          {footerMsg}
        </div>
      )}
    </div>
  );
};

export default FooterSummary;