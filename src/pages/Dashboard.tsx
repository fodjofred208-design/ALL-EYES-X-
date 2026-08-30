import React, { useState, useEffect } from 'react';
import { ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import { useDashboard, DashboardProvider } from '../context/DashboardContext';
import { useDevices } from '../context/DeviceContext';
import AmbientBackground from '../components/effects/AmbientBackground';
import KpiStrip from '../components/dashboard/KpiStrip';
import SecurityScore from '../components/dashboard/SecurityScore';
import ThreatLevel from '../components/dashboard/ThreatLevel';
import DevicesOverview from '../components/dashboard/DevicesOverview';
import GlobalTopologyMap from '../components/dashboard/GlobalTopologyMap';
import CriticalChartAnalysis from '../components/dashboard/CriticalChartAnalysis';
import DevicesStatsPanel from '../components/dashboard/DevicesStatsPanel';
import TrafficAnalysisPanel from '../components/dashboard/TrafficAnalysisPanel';
import SecurityActivityStrip from '../components/dashboard/SecurityActivityStrip';
import SystemHealth from '../components/dashboard/SystemHealth';
import AuthenticationPanel from '../components/dashboard/AuthenticationPanel';
import AlertPanel from '../components/dashboard/AlertPanel';
import DeviceRiskTable from '../components/dashboard/DeviceRiskTable';
import QuickActions from '../components/dashboard/QuickActions';
import FooterSummary from '../components/dashboard/FooterSummary';

const morphEase: [number, number, number, number] = [0.22, 1, 0.36, 1];

/* staggered entrance — header → KPI → security → overview → analysis (spec §14) */
const Section: React.FC<{ delay?: number; className?: string; children: React.ReactNode }> = ({
  delay = 0, className = '', children,
}) => (
  <motion.div
    initial={{ opacity: 0, y: 14 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5, delay, ease: morphEase }}
    className={className}
  >
    {children}
  </motion.div>
);

const DashboardPage: React.FC = () => {
  const { data, loading, error, scopeDeviceId } = useDashboard();
  const { devices } = useDevices();
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const scopeDevice = scopeDeviceId ? devices.find(d => d.id === scopeDeviceId) : null;
  const scopeLabel = scopeDevice ? scopeDevice.hostname : 'ALL EYES STAT';

  if (!data && !loading) {
    return (
      <div className="aeyes-card p-6 text-center max-w-lg mx-auto mt-16">
        <ShieldCheck size={28} className="mx-auto text-slate-700 mb-3" />
        <p className="text-[11px] font-orbitron text-slate-400 uppercase tracking-widest">Cannot reach intelligence engine</p>
        <p className="text-[10px] font-mono-data text-slate-600 mt-2">
          The command center is empty because <span className="text-slate-400">/api/dashboard</span> returned nothing.
          Check that <span className="text-slate-400">python server/app.py</span> is running, that you are signed in
          (the endpoint requires a session), and that the browser can reach the API base.
        </p>
        {error && (
          <p className="text-[10px] font-mono-data text-red-400/80 mt-2">{error}</p>
        )}
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-8 w-72" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map(i => <div key={i} className="skeleton h-24" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="skeleton h-56" />
          <div className="skeleton h-56" />
        </div>
        <div className="skeleton h-72" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="skeleton h-64" />
          <div className="skeleton h-64" />
        </div>
      </div>
    );
  }

  return (
    /* pt-20 clears the fixed h-16 top bar; every other route gets this from the
       <Panel> wrapper, but the Dashboard route supplies its own provider instead
       so it needs the offset here. Without it the COMMAND CENTER title sat
       underneath the header bar. */
    <div className="relative space-y-4 pt-20 pb-16 px-4 md:px-8">
      <AmbientBackground variant="squares" className="fixed inset-0 -z-10" />
      <div className="aeyes-grain" />

      {/* HEADER — COMMAND CENTER / Full System Overview */}
      <Section delay={0}>
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl md:text-4xl font-orbitron font-bold tracking-[0.28em] text-white aeyes-title-glow">
                COMMAND <span className="text-[#22c55e]">CENTER</span>
              </h1>
              <span
                className={`px-3 py-1 rounded-md text-[9px] font-orbitron tracking-[0.2em] uppercase border ${
                  scopeDevice
                    ? 'border-green-500/50 text-green-300 bg-green-500/10'
                    : 'border-cyan-500/50 text-cyan-200 bg-cyan-500/10'
                }`}
              >
                {scopeDevice ? `Node · ${scopeLabel}` : 'All Eyes Stat'}
              </span>
            </div>
            <p className="mt-1 text-[10px] font-mono-data text-[#22c55e] tracking-[0.35em] uppercase">
              {scopeDevice ? 'Single device intelligence' : 'Full System Overview'}
            </p>
            <div className="aeyes-divider mt-2 w-64 md:w-96" />
            <p className="text-[10px] font-mono-data text-slate-500 mt-2">
              ALL EYES X · Engine v{data?.version ?? '—'} · {data?.server_time ?? '—'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[9px] font-orbitron text-slate-500 uppercase tracking-widest">Local Time</p>
            <p className="text-[13px] font-mono-data text-green-300">
              {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
          </div>
        </div>
      </Section>

      {/* 1. TOP KPI COMMAND STRIP */}
      <Section delay={0.05}>
        <KpiStrip />
      </Section>

      {/* 2. SECURITY SCORE + THREAT LEVEL */}
      <Section delay={0.1}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SecurityScore />
          <ThreatLevel />
        </div>
      </Section>

      {/* 3. CONNECTED DEVICES + GLOBAL TOPOLOGY */}
      <Section delay={0.15}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <DevicesOverview />
          </div>
          <GlobalTopologyMap />
        </div>
      </Section>

      {/* 4. CRITICAL CHART ANALYSIS — inset-panel navigation */}
      <Section delay={0.2}>
        <CriticalChartAnalysis />
      </Section>

      {/* 5. DEVICES STATS + TRAFFIC ANALYSIS */}
      <Section delay={0.25}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <DevicesStatsPanel />
          <TrafficAnalysisPanel />
        </div>
      </Section>

      {/* 6. AUTHENTICATION MONITOR + ALERT CENTER + RISK RANKING */}
      <Section delay={0.28}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <AuthenticationPanel />
          <AlertPanel />
          <DeviceRiskTable />
        </div>
      </Section>

      {/* 7. SECURITY ACTIVITY + SYSTEM HEALTH */}
      <Section delay={0.3}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <SecurityActivityStrip />
          </div>
          <SystemHealth />
        </div>
      </Section>

      {/* 7. QUICK ACTIONS */}
      <Section delay={0.35}>
        <QuickActions />
      </Section>

      {/* 8. FOOTER */}
      <Section delay={0.4}>
        <FooterSummary />
      </Section>

      <p className="text-center text-[9px] font-mono-data text-slate-700 pt-2">
        <ShieldCheck size={10} className="inline mr-1" />
        Auto-refreshes every 5s · engine computes · frontend renders only
      </p>
    </div>
  );
};

const Dashboard: React.FC = () => {
  // Target Node from the header drives the whole Command Center scope.
  const { selectedDevice } = useDevices();
  return (
    <DashboardProvider deviceId={selectedDevice?.id ?? null}>
      <DashboardPage />
    </DashboardProvider>
  );
};

export default Dashboard;