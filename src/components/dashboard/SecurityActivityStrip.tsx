import React from 'react';
import { KeyRound, ShieldAlert } from 'lucide-react';
import DashboardCard from './DashboardCard';
import { useDashboard } from '../../context/DashboardContext';
import { relativeTime } from '../../utils/format';

const SecurityActivityStrip: React.FC = () => {
  const { data } = useDashboard();
  const auth = data?.auth;
  const recent = data?.alerts?.recent ?? [];
  const authPending = auth == null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <DashboardCard title="Authentication Monitor" subtitle="compact security activity" icon={<KeyRound size={18} />} accent="#22c55e" variant="ghost">
        {authPending ? (
          <div className="py-6 text-center">
            <p className="text-[10px] font-orbitron text-slate-500 tracking-widest uppercase">Backend pending</p>
            <p className="text-[9px] font-mono-data text-slate-600 mt-1">Authentication telemetry unavailable</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {[
                { l: 'Success', v: auth?.success_today ?? 0, c: '#22c55e' },
                { l: 'Failed', v: auth?.failed_today ?? 0, c: '#ef4444' },
                { l: 'Suspicious', v: auth?.brute_force_attempts ?? 0, c: '#f59e0b' },
              ].map(s => (
                <div key={s.l} className="p-2 rounded-lg bg-white/5 text-center">
                  <p className="text-[8px] font-orbitron text-slate-500 uppercase">{s.l}</p>
                  <p className="text-lg font-bold font-rajdhani" style={{ color: s.c }}>{s.v}</p>
                </div>
              ))}
            </div>
            <div className="max-h-28 overflow-y-auto space-y-1">
              {(auth?.recent ?? []).slice(0, 5).map((at: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-[9px] font-mono-data text-slate-400">
                  <span className={`w-1.5 h-1.5 rounded-full ${at.success ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span className="flex-1 truncate">{at.username || 'unknown'} · {at.ip || '—'}</span>
                  <span className="text-slate-600">{relativeTime(at.timestamp)}</span>
                </div>
              ))}
              {(auth?.recent ?? []).length === 0 && (
                <p className="text-center text-[9px] text-slate-600 font-mono-data py-2">No login attempts recorded</p>
              )}
            </div>
          </>
        )}
      </DashboardCard>

      <DashboardCard title="Recent Alerts" subtitle="live security events" icon={<ShieldAlert size={18} />} accent="#22c55e">
        <div className="max-h-40 overflow-y-auto space-y-1.5">
          {recent.length === 0 && (
            <p className="text-center text-[9px] text-slate-600 font-mono-data py-6">No active alerts</p>
          )}
          {recent.slice(0, 6).map((a: any, i: number) => (
            <div
              key={a.id ?? i}
              className={`aeyes-slide-in p-2 rounded-lg bg-white/5 border-l-2 ${String(a.severity).toLowerCase() === 'critical' ? 'aeyes-critical' : ''}`}
              style={{
                borderLeftColor:
                  String(a.severity).toLowerCase() === 'critical' ? '#ef4444' :
                  String(a.severity).toLowerCase() === 'high' ? '#f97316' :
                  String(a.severity).toLowerCase() === 'medium' ? '#eab308' : '#22c55e',
                animationDelay: `${Math.min(i * 50, 300)}ms`,
              }}
            >
              <p className="text-[10px] font-mono-data text-slate-300 truncate">{a.title || a.message || 'alert'}</p>
              <p className="text-[8px] font-mono-data text-slate-600 mt-0.5">{relativeTime(a.timestamp)}</p>
            </div>
          ))}
        </div>
      </DashboardCard>
    </div>
  );
};

export default SecurityActivityStrip;