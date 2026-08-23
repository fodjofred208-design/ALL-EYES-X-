import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useDashboard } from '../../../context/DashboardContext';

const TrafficChart: React.FC = () => {
  const { data } = useDashboard();
  const rows = ((data?.charts?.traffic_24h) ?? []).map((p: any) => ({
    name: (p.ts ? new Date(p.ts * 1000) : new Date()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    download: +(p.download ?? 0),
    upload: +(p.upload ?? 0),
  }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={rows}>
        <defs>
          <linearGradient id="gradDl" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#00d4ff" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#00d4ff" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradUl" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
        <XAxis dataKey="name" stroke="#ffffff10" fontSize={9} tickLine={false} axisLine={false} minTickGap={30} />
        <YAxis stroke="#ffffff10" fontSize={9} tickLine={false} axisLine={false} width={40} />
        <Tooltip contentStyle={{ backgroundColor: '#0a0e1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 11, fontFamily: 'Share Tech Mono' }} />
        <Legend wrapperStyle={{ fontSize: 9, fontFamily: 'Share Tech Mono' }} />
        <Area type="monotone" dataKey="download" name="DL KB/s" stroke="#00d4ff" fill="url(#gradDl)" strokeWidth={2} />
        <Area type="monotone" dataKey="upload" name="UL KB/s" stroke="#22c55e" fill="url(#gradUl)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
};
export default TrafficChart;