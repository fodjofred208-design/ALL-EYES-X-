import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import DashboardCard from './DashboardCard';
import { useDashboard } from '../../context/DashboardContext';

const LEVEL_COLORS: Record<string, string> = { LOW: '#22c55e', MEDIUM: '#eab308', HIGH: '#f97316', CRITICAL: '#ef4444' };

const DeviceRiskTable: React.FC = () => {
  const { data } = useDashboard();
  const navigate = useNavigate();
  const ranking = data?.risk_ranking ?? [];
  return (
    <DashboardCard title="Device Risk Ranking" subtitle="highest → lowest · explainable factors" icon={<ShieldAlert size={18} />} accent="#f97316">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-[9px] font-orbitron text-slate-500 uppercase tracking-widest border-b border-white/5">
              <th className="py-2 pr-2">Host</th>
              <th className="py-2 pr-2">OS</th>
              <th className="py-2 pr-2">Status</th>
              <th className="py-2 pr-2">Risk</th>
              <th className="py-2">Level</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((r: any) => (
              <tr key={r.device_id} onClick={() => navigate(`/device/${r.device_id}`)}
                className="border-b border-white/5 cursor-pointer hover:bg-white/5 transition-colors">
                <td className="py-2 pr-2 text-[11px] font-rajdhani text-slate-200">{r.hostname}</td>
                <td className="py-2 pr-2 text-[10px] font-mono-data text-slate-400">{r.os}</td>
                <td className="py-2 pr-2">
                  <span className={`text-[9px] font-orbitron ${r.status === 'online' ? 'text-green-500' : 'text-slate-500'}`}>
                    {String(r.status).toUpperCase()}
                  </span>
                </td>
                <td className="py-2 pr-2">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full transition-all duration-700" style={{ width: `${r.risk}%`, backgroundColor: LEVEL_COLORS[r.level] ?? '#64748b' }} />
                    </div>
                    <span className="text-[10px] font-mono-data text-slate-300">{r.risk}</span>
                  </div>
                </td>
                <td className="py-2">
                  <span className="px-2 py-0.5 rounded text-[9px] font-orbitron"
                    style={{ backgroundColor: `${LEVEL_COLORS[r.level] ?? '#64748b'}22`, color: LEVEL_COLORS[r.level] ?? '#94a3b8' }}>
                    {r.level}
                  </span>
                </td>
              </tr>
            ))}
            {ranking.length === 0 && (
              <tr><td colSpan={5} className="py-6 text-center text-[10px] text-slate-600 font-mono-data">No devices registered</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </DashboardCard>
  );
};
export default DeviceRiskTable;