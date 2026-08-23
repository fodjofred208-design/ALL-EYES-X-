import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, Legend } from 'recharts';
import { Cpu, TrendingUp, ShieldAlert, Network, Activity, PieChart } from 'lucide-react';
import DashboardCard from './DashboardCard';
import TrafficChart from './charts/TrafficChart';
import CPUChart from './charts/CPUChart';
import ProtocolChart from './charts/ProtocolChart';
import ThreatChart from './charts/ThreatChart';
import { useDashboard } from '../../context/DashboardContext';

const tooltipStyle = { backgroundColor: '#0a0e1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 11, fontFamily: 'Share Tech Mono' };
const axis = { stroke: '#ffffff10', fontSize: 9, tickLine: false as const, axisLine: false as const };

const PerformanceCharts: React.FC = () => {
  const { data } = useDashboard();
  const c = data?.charts;

  const growth = (c?.device_growth?.labels ?? []).map((l: string, i: number) => ({ name: l.slice(5), devices: c?.device_growth?.values?.[i] ?? 0 }));
  const alertTrend = (c?.alert_trend?.labels ?? []).map((l: string, i: number) => ({
    name: l,
    critical: c?.alert_trend?.critical?.[i] ?? 0,
    high: c?.alert_trend?.high?.[i] ?? 0,
    medium: c?.alert_trend?.medium?.[i] ?? 0,
    low: c?.alert_trend?.low?.[i] ?? 0,
  }));
  const online = (c?.online_trend?.labels ?? []).map((l: string, i: number) => ({
    name: l.split(':').slice(0, 2).join(':'),
    online: c?.online_trend?.online?.[i] ?? 0,
    offline: c?.online_trend?.offline?.[i] ?? 0,
  }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <DashboardCard title="Traffic Trend" subtitle="KB/s · live samples" icon={<Network size={18} />} accent="#00d4ff">
        <div className="h-48"><TrafficChart /></div>
      </DashboardCard>
      <DashboardCard title="CPU / RAM / Disk" subtitle="aggregate % across nodes" icon={<Cpu size={18} />} accent="#8b5cf6">
        <div className="h-48"><CPUChart /></div>
      </DashboardCard>
      <DashboardCard title="Security Score Trend" subtitle="0–100 from engine" icon={<ShieldAlert size={18} />} accent="#ef4444">
        <div className="h-44"><ThreatChart /></div>
      </DashboardCard>
      <DashboardCard title="Protocol Share" subtitle="estimated baseline (swappable)" icon={<Activity size={18} />} accent="#22c55e">
        <div className="h-44"><ProtocolChart /></div>
      </DashboardCard>
      <DashboardCard title="Device Growth" subtitle="registrations per day" icon={<TrendingUp size={18} />} accent="#00d4ff">
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={growth}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
              <XAxis dataKey="name" {...axis} />
              <YAxis {...axis} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="devices" fill="#22c55e" radius={[3, 3, 0, 0]} barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </DashboardCard>
      <DashboardCard title="Alert Trend (24h)" subtitle="new alerts by severity" icon={<PieChart size={18} />} accent="#eab308">
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={alertTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
              <XAxis dataKey="name" {...axis} />
              <YAxis {...axis} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 9, fontFamily: 'Share Tech Mono' }} />
              <Bar dataKey="critical" stackId="a" fill="#ef4444" barSize={8} />
              <Bar dataKey="high" stackId="a" fill="#f97316" barSize={8} />
              <Bar dataKey="medium" stackId="a" fill="#eab308" barSize={8} />
              <Bar dataKey="low" stackId="a" fill="#00d4ff" barSize={8} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </DashboardCard>
      <DashboardCard title="Online vs Offline" subtitle="fleet connectivity" icon={<Activity size={18} />} accent="#22c55e" className="lg:col-span-2">
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={online}>
              <defs>
                <linearGradient id="gradOn" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradOff" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#64748b" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#64748b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
              <XAxis dataKey="name" {...axis} />
              <YAxis {...axis} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 9, fontFamily: 'Share Tech Mono' }} />
              <Area type="monotone" dataKey="online" stroke="#22c55e" fill="url(#gradOn)" strokeWidth={2} />
              <Area type="monotone" dataKey="offline" stroke="#64748b" fill="url(#gradOff)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </DashboardCard>
    </div>
  );
};
export default PerformanceCharts;