import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Terminal, Camera, Fingerprint, ShieldCheck, BarChart3, Monitor, Bell } from 'lucide-react';
import DashboardCard from './DashboardCard';

const ACTIONS = [
  { label: 'Devices', path: '/devices', icon: <Monitor size={16} /> },
  { label: 'Live Monitor', path: '/live_monitor', icon: <Zap size={16} /> },
  { label: 'Touch Monitor', path: '/touch_monitor', icon: <Fingerprint size={16} /> },
  { label: 'Webcam', path: '/webcam', icon: <Camera size={16} /> },
  { label: 'Terminal', path: '/terminal', icon: <Terminal size={16} /> },
  { label: 'Analytics', path: '/analytics', icon: <BarChart3 size={16} /> },
  { label: 'Alert Center', path: '/security', icon: <ShieldCheck size={16} /> },
  { label: 'Notifications', path: null, icon: <Bell size={16} /> },
];

const QuickActions: React.FC = () => {
  const navigate = useNavigate();

  const handle = (path: string | null) => {
    if (!path) {
      // opens the floating NotificationCenter (mounted once in App.tsx)
      window.dispatchEvent(new Event('aeyes-open-notifications'));
      return;
    }
    navigate(path);
  };

  return (
    <DashboardCard
      title="Quick Actions"
      subtitle="direct access to live modules"
      icon={<Zap size={18} />}
      accent="#22c55e"
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {ACTIONS.map(a => (
          <button
            key={a.label}
            type="button"
            onClick={() => handle(a.path)}
            className="group p-3 rounded-xl bg-white/[0.03] border border-white/5 hover:border-green-500/40 hover:bg-green-500/5 transition-all text-left"
          >
            <span className="block mb-2 text-[#22c55e]">{a.icon}</span>
            <span className="text-[9px] font-orbitron uppercase tracking-widest text-slate-300 group-hover:text-green-300 transition-colors">
              {a.label}
            </span>
          </button>
        ))}
      </div>
    </DashboardCard>
  );
};

export default QuickActions;