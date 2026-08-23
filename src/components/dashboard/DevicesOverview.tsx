import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Monitor } from 'lucide-react';
import DashboardCard from './DashboardCard';
import { useDashboard } from '../../context/DashboardContext';
import { relativeTime } from '../../utils/format';
import { computeDeviceTotals } from '../../utils/normalize';

const DevicesOverview: React.FC = () => {
  const { data } = useDashboard();
  const navigate = useNavigate();
  // normalize every device row (id/device_id, hostname/name, os/platform...)
  const devTotals = computeDeviceTotals(data?.devices?.list ?? []);
  const devices = devTotals.list;
  


  return (
    <DashboardCard
      title="Connected Devices"
      subtitle="hostname · ip · status · os · last seen"
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
      <div className="aeyes-scroll max-h-[320px] overflow-y-auto pr-1">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-[#060812]/80 backdrop-blur-sm z-[1]">
            <tr className="text-[9px] font-orbitron text-slate-500 uppercase tracking-widest border-b border-white/5">
              <th className="py-2 pr-2">Hostname</th>
              <th className="py-2 pr-2">IP</th>
              <th className="py-2 pr-2">Status</th>
              <th className="py-2 pr-2">OS</th>
              <th className="py-2">Last Seen</th>
            </tr>
          </thead>
          <tbody>
            {devices.map((d: any, i: number) => {
              const id = d.device_id ?? d.id;
              const online = String(d.status ?? '').toLowerCase() === 'online';
              return (
                <tr
                  key={id ?? i}
                  onClick={() => id && navigate(`/device/${id}`)}
                  className="aeyes-rise border-b border-white/5 cursor-pointer hover:bg-[rgba(34,197,94,0.05)] transition-colors"
                  style={{ animationDelay: `${Math.min(i * 40, 400)}ms` }}
                >
                  <td className="py-2.5 pr-2 text-[11px] font-rajdhani text-slate-200">
                    {d.hostname || 'unknown'}
                  </td>
                  <td className="py-2.5 pr-2 text-[10px] font-mono-data text-slate-400">{d.ip || '—'}</td>
                  <td className="py-2.5 pr-2">
                    <span className="inline-flex items-center gap-1.5 text-[9px] font-orbitron text-slate-300">
                      <span className={`status-dot ${online ? 'status-online' : 'status-offline'}`} />
                      {String(d.status ?? 'offline').toUpperCase()}
                    </span>
                  </td>
                  <td className="py-2.5 pr-2 text-[10px] font-mono-data text-slate-500 truncate max-w-[120px]">{d.os || '—'}</td>
                  <td className="py-2.5 text-[9px] font-mono-data text-slate-500">{relativeTime(d.last_seen)}</td>
                </tr>
              );
            })}
            {devices.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-[10px] text-slate-600 font-mono-data">
                  No devices registered — clients appear after first heartbeat
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between text-[9px] font-mono-data text-slate-600">
        <span>{devTotals.total} total · {devTotals.online} online · {devTotals.offline} offline</span>
        <span>scroll for more · click row for detail</span>
      </div>
    </DashboardCard>
  );
};

export default DevicesOverview;