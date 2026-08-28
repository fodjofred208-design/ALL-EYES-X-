import React from 'react';
import { BarChart3 } from 'lucide-react';
import { useDashboard } from '../context/DashboardContext';
import { useDevices } from '../context/DeviceContext';
import PerformanceCharts from '../components/dashboard/PerformanceCharts';

const ChartAnalysis: React.FC = () => {
  const { data, loading, scopeDeviceId } = useDashboard();
  const { devices } = useDevices();
  const charts = data?.charts ?? {};
  const hasSeries = Object.values(charts).some((v: any) => Array.isArray(v) && v.length > 0);
  const scopeDevice = scopeDeviceId ? devices.find(d => d.id === scopeDeviceId) : null;

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl md:text-3xl font-orbitron font-bold tracking-[0.28em] text-white aeyes-title-glow">
            CRITICAL <span className="text-[#22c55e]">CHART ANALYSIS</span>
          </h1>
          <span
            className={`px-3 py-1 rounded-md text-[9px] font-orbitron tracking-[0.2em] uppercase border ${
              scopeDevice
                ? 'border-green-500/50 text-green-300 bg-green-500/10'
                : 'border-cyan-500/50 text-cyan-200 bg-cyan-500/10'
            }`}
          >
            {scopeDevice ? `Node · ${scopeDevice.hostname}` : 'All Eyes Stat'}
          </span>
        </div>
        <p className="mt-1 text-[10px] font-mono-data text-[#22c55e] tracking-[0.35em] uppercase">
          CPU / RAM / Disk · Security Score · Alert Trend · Traffic
        </p>
        <p className="mt-1 text-[9px] font-mono-data text-slate-500">
          {scopeDevice
            ? 'Charts below are limited to the device selected in the header Target Node.'
            : 'Charts below aggregate every registered device. Pick a Target Node to isolate one device.'}
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