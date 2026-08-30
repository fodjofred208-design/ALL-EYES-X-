import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Monitor, Wifi, Users, AlertTriangle } from 'lucide-react';
import { useDashboard } from '../../context/DashboardContext';
import KpiCard from './KpiCard';

const KpiStrip: React.FC = () => {
  const { data } = useDashboard();
  const navigate = useNavigate();

  const dev = data?.devices ?? { total: 0, online: 0, offline: 0, list: [] };
  const alerts = data?.alerts ?? { total: 0, recent: [] };
  const open = Number(alerts.total ?? 0);
  const onlinePct = dev.total > 0 ? Math.round((dev.online / dev.total) * 100) : 0;
  const offlinePct = dev.total > 0 ? Math.round((dev.offline / dev.total) * 100) : 0;

  // Determine highest severity from alerts.recent
  const recent = Array.isArray(alerts.recent) ? alerts.recent : [];
  const topSev =
    recent.filter((a: any) => String(a.severity || '').toLowerCase() === 'critical').length > 0
      ? 'CRITICAL'
      : recent.filter((a: any) => String(a.severity || '').toLowerCase() === 'high').length > 0
        ? 'HIGH'
        : open > 0
          ? 'OPEN'
          : 'NONE';

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <KpiCard
        label="Total Devices"
        value={dev.total}
        sub="registered fleet"
        icon={<Monitor size={16} />}
        accent="#22c55e"
        onClick={() => navigate('/devices', { state: { from: 'dashboard' } })}
        delay={0}
      />
      <KpiCard
        label="Online"
        value={dev.online}
        sub={`${onlinePct}% of fleet live`}
        icon={<Wifi size={16} />}
        accent="#22c55e"
        variant="ghost"
        delay={40}
      />
      <KpiCard
        label="Offline"
        value={dev.offline}
        sub={`${offlinePct}% no heartbeat`}
        icon={<Users size={16} />}
        accent="#64748b"
        delay={80}
      />
      <KpiCard
        label="Open Alerts"
        value={open}
        sub={`highest · ${topSev}`}
        icon={<AlertTriangle size={16} />}
        accent={open > 0 ? '#ef4444' : '#22c55e'}
        variant="ghost"
        onClick={() => navigate('/alerts')}
        delay={120}
      />
    </div>
  );
};

export default KpiStrip;