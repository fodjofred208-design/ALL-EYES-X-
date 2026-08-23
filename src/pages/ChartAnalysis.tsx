import React from 'react';
import { BarChart3 } from 'lucide-react';
import { useDashboard } from '../context/DashboardContext';
import PerformanceCharts from '../components/dashboard/PerformanceCharts';

const ChartAnalysis: React.FC = () => {
  const { data, loading } = useDashboard();
  const charts = data?.charts ?? {};
  const hasSeries = Object.values(charts).some((v: any) => Array.isArray(v) && v.length > 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl md:text-3xl font-orbitron font-bold tracking-[0.3em] neon-text">
          CRITICAL CHART ANALYSIS
        </h1>
        <p className="mt-1 text-[10px] font-mono-data text-[#22c55e] tracking-[0.35em] uppercase">
          CPU / RAM / Disk · Security Score · Protocol Share · Device Growth · Alert Trend · Timeline
        </p>
        <div className="aeyes-divider mt-2 w-64 md:w-96" />
      </div>

      {loading && !data ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-56" />)}
        </div>
      ) : !hasSeries ? (
        <div className="aeyes-card p-8 text-center">
          <BarChart3 size={28} className="mx-auto text-slate-700 mb-3" />
          <p className="text-[10px] font-orbitron text-slate-400 uppercase tracking-widest">Collecting telemetry…</p>
          <p className="text-[9px] font-mono-data text-slate-600 mt-2">
            Chart series are empty. Once the backend fills <span className="text-green-400">charts</span> (Step 1),
            all six charts render here automatically.
          </p>
        </div>
      ) : (
        <PerformanceCharts />
      )}
    </div>
  );
};

export default ChartAnalysis;