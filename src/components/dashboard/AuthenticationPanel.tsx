import React from 'react';
import { KeyRound } from 'lucide-react';
import DashboardCard from './DashboardCard';
import { useDashboard } from '../../context/DashboardContext';
import { relativeTime } from '../../utils/format';

const AuthenticationPanel: React.FC = () => {
  const { data } = useDashboard();
  const a = data?.auth;
  const attempts = a?.recent ?? [];

  if (a == null) {
    return (
      <DashboardCard title="Authentication Monitor" subtitle="logins · lockouts · brute force" icon={<KeyRound size={18} />} accent="#22c55e" variant="ghost">
        <div className="py-10 text-center">
          <p className="text-[10px] font-orbitron text-slate-500 tracking-widest uppercase">Backend pending</p>
          <p className="text-[9px] font-mono-data text-slate-600 mt-1">Authentication telemetry unavailable</p>
        </div>
      </DashboardCard>
    );
  }

  const stats = [
    { label: 'Success 24h', value: a.success_today ?? 0, color: '#22c55e' },
    { label: 'Failed 24h', value: a.failed_today ?? 0, color: '#ef4444' },
    { label: 'Brute Force IPs', value: a.brute_force_attempts ?? 0, color: '#f59e0b' },
    {
      label: 'Locked Accounts',
      value: Array.isArray(a.locked_accounts) ? a.locked_accounts.length : Number(a.locked_accounts ?? 0),
      color: '#22c55e',
    },
    { label: 'Remote Logins', value: a.remote_logins ?? 0, color: '#22c55e' },
    { label: 'Unknown Users', value: a.unknown_users ?? 0, color: '#f59e0b' },
  ];

  return (
    <DashboardCard title="Authentication Monitor" subtitle="logins · lockouts · brute force" icon={<KeyRound size={18} />} accent="#22c55e" variant="ghost">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
        {stats.map(s => (
          <div key={s.label} className="p-2 rounded-lg bg-white/5 text-center">
            <p className="text-[8px] font-orbitron text-slate-500 uppercase tracking-widest">{s.label}</p>
            <p className="text-lg font-bold font-rajdhani" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
        {attempts.length === 0 && (
          <p className="text-center text-[10px] text-slate-600 font-mono-data py-4">No login attempts recorded yet</p>
        )}
        {attempts.slice(0, 10).map((at: any, i: number) => (
          <div key={at.id ?? i} className="flex items-center gap-2 p-2 rounded-lg bg-white/5">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${at.success ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-[10px] font-mono-data text-slate-300 flex-1 truncate">
              {at.username || 'unknown'} · {at.ip || '—'}{at.remote ? ' · remote' : ''}
            </span>
            <span className="text-[9px] font-mono-data text-slate-500">{relativeTime(at.timestamp)}</span>
          </div>
        ))}
      </div>
    </DashboardCard>
  );
};

export default AuthenticationPanel;