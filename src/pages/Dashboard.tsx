import React, { useState, useEffect } from 'react';
import { ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import { useDashboard, DashboardProvider } from '../context/DashboardContext';
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
  const { data, loading } = useDashboard();
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!data && !loading) {
    return (
      <div className="aeyes-card p-6 text-center max-w-lg mx-auto mt-16">
        <ShieldCheck size={28} className="mx-auto text-slate-700 mb-3" />
        <p className="text-[11px] font-orbitron text-slate-400 uppercase tracking-widest">Cannot reach intelligence engine</p>
        <p className="text-[10px] font-mono-data text-slate-600 mt-2">
          The command center is empty because <span className="text-slate-400">/api/dashboard</span> returned nothing.
          Check: server running in engine mode (<span className="text-green-400">[ENGINE] dashboard_engine loaded</span> in boot log),
          CORS enabled, and the browser can reach the API base.
        </p>
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
    <div className="relative space-y-4">
      <AmbientBackground variant="squares" className="fixed inset-0 -z-10" />
      <div className="aeyes-grain" />

      {/* HEADER — COMMAND CENTER / Full System Overview */}
      <Section delay={0}>
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-orbitron font-bold tracking-[0.3em] neon-text">
              COMMAND CENTER
            </h1>
            <p className="mt-1 text-[10px] font-mono-data text-[#22c55e] tracking-[0.35em] uppercase">
              Full System Overview
            </p>
            <div className="aeyes-divider mt-2 w-64 md:w-96" />
            <p className="text-[10px] font-mono-data text-slate-500 mt-2">
              ALL EYES X · Dashboard Engine v{data?.version ?? '—'} · {data?.server_time ?? '—'}
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

      {/* 6. SECURITY ACTIVITY + SYSTEM HEALTH */}
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

const Dashboard: React.FC = () => (
  <DashboardProvider>
    <DashboardPage />
  </DashboardProvider>
);

export default Dashboard;