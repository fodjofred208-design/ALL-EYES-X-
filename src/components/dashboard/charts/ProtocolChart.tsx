import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useDashboard } from '../../../context/DashboardContext';

const ProtocolChart: React.FC = () => {
  const { data } = useDashboard();
  const rows = (data?.protocols ?? []).slice(0, 10);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} layout="vertical" margin={{ left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" horizontal={false} />
        <XAxis type="number" stroke="#ffffff10" fontSize={9} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="name" stroke="#ffffff10" fontSize={9} tickLine={false} axisLine={false} width={44} />
        <Tooltip contentStyle={{ backgroundColor: '#0a0e1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 11, fontFamily: 'Share Tech Mono' }} formatter={(v: any) => [`${v}%`, 'share']} />
        <Bar dataKey="percent" fill="#00d4ff" radius={[0, 3, 3, 0]} barSize={12} />
      </BarChart>
    </ResponsiveContainer>
  );
};
export default ProtocolChart;