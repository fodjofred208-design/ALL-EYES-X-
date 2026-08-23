import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { useDashboard } from '../../../context/DashboardContext';

const ThreatChart: React.FC = () => {
  const { data } = useDashboard();
  const t = data?.charts?.threat;
  const rows = (t?.labels ?? []).map((l: string, i: number) => ({
    name: l.split(':').slice(0, 2).join(':'),
    score: t?.values?.[i] ?? 0,
  }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={rows}>
        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
        <XAxis dataKey="name" stroke="#ffffff10" fontSize={9} tickLine={false} axisLine={false} />
        <YAxis domain={[0, 100]} stroke="#ffffff10" fontSize={9} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={{ backgroundColor: '#0a0e1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 11, fontFamily: 'Share Tech Mono' }} />
        <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="4 4" />
        <ReferenceLine y={40} stroke="#f97316" strokeDasharray="4 4" />
        <ReferenceLine y={20} stroke="#eab308" strokeDasharray="4 4" />
        <Line type="monotone" dataKey="score" stroke="#ef4444" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
};
export default ThreatChart;