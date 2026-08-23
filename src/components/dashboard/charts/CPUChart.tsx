import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useDashboard } from '../../../context/DashboardContext';

const CPUChart: React.FC = () => {
  const { data } = useDashboard();
  const c = data?.charts;
  const rows = (c?.cpu?.labels ?? []).map((l: string, i: number) => ({
    name: l.split(':').slice(0, 2).join(':'),
    cpu: Math.round(c?.cpu?.values?.[i] ?? 0),
    ram: Math.round(c?.ram?.values?.[i] ?? 0),
    disk: Math.round(c?.disk?.values?.[i] ?? 0),
  }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={rows}>
        <defs>
          <linearGradient id="gradCpu" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#00d4ff" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#00d4ff" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradRam" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradDisk" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#eab308" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#eab308" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
        <XAxis dataKey="name" stroke="#ffffff10" fontSize={9} tickLine={false} axisLine={false} />
        <YAxis domain={[0, 100]} stroke="#ffffff10" fontSize={9} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={{ backgroundColor: '#0a0e1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 11, fontFamily: 'Share Tech Mono' }} />
        <Area type="monotone" dataKey="cpu" stroke="#00d4ff" fill="url(#gradCpu)" strokeWidth={2} />
        <Area type="monotone" dataKey="ram" stroke="#8b5cf6" fill="url(#gradRam)" strokeWidth={2} />
        <Area type="monotone" dataKey="disk" stroke="#eab308" fill="url(#gradDisk)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
};
export default CPUChart;