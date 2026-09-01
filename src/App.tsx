import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';


import NeuralEye from './components/NeuralEye';
import ConstellationBackground from './components/ConstellationBackground';


import Dashboard from './pages/Dashboard';
import { DashboardProvider } from './context/DashboardContext';
import { useDevices } from './context/DeviceContext';
import { WelcomeProvider, useWelcome } from './context/WelcomeContext';
import WelcomeExperience from './components/welcome/WelcomeExperience';
import NotificationCenter from './components/NotificationCenter';

import Analysis from './pages/Analysis';
import Topology from './pages/Topology';
import AlertCenter from './pages/AlertCenter';
import ChartAnalysis from './pages/ChartAnalysis';
import Devices from './pages/Device';
import DeviceDetail from './pages/DeviceDetail';

import TerminalPage from './pages/Terminal';
import MultiShell from './pages/MultiShell';
import DeviceWall from './pages/DeviceWall';
import WebcamPanel from './pages/Webcam';

import P2PShare from './pages/P2PShare';
import Security from './pages/Security';
import Login from './pages/Login';

import { SocketProvider } from './context/SocketContext';
import { DeviceProvider } from './context/DeviceContext';
import LiveMonitor from './pages/LiveMonitor';
import TouchMonitor from './pages/TouchMonitor';

import Layout from './components/Layout';

const morphEase: [number, number, number, number] = [0.22, 1, 0.36, 1];

const Panel: React.FC<{ children: React.ReactNode; morph?: number }> = ({
  children,
  morph = 0.5,
}) => (
  <motion.div
    initial={{ opacity: 0, y: 16, scale: 0.98, filter: 'blur(6px)' }}
    animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
    exit={{ opacity: 0, y: -12, scale: 1.01, filter: 'blur(6px)' }}
    transition={{ duration: morph, ease: morphEase }}
    className="panel-shine w-full min-h-screen pt-20 pb-16 px-4 md:px-8 relative z-10"
  >
    {children}
  </motion.div>
);

/** The three primary intelligence views use a slower, cleaner 3s morph. */
const MORPH_SLOW = 3;

const LoadingScreen: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Initializing Neural Core...");

  const msgs = [
    "Initializing Neural Core...",
    "Establishing Black Cortex Uplink...",
    "Syncing Surveillance Matrix...",
    "Bypassing Administrative Barriers...",
    "Deploying Stealth Agents...",
    "Universal Control Established.",
  ];

  // onComplete via ref — never stale, StrictMode-safe
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // 1) progress tick — pure updater, NO side effects inside setState
  useEffect(() => {
    const timer = setInterval(() => {
      setProgress(p => (p >= 100 ? 100 : p + 1));
    }, 50);
    return () => clearInterval(timer);
  }, []);

  // 2) at 100% → wait 1.2s → hand off to login exactly once
  useEffect(() => {
    if (progress >= 100) {
      const t = setTimeout(() => onCompleteRef.current(), 1200);
      return () => clearTimeout(t);
    }
  }, [progress]);

  // 3) hard watchdog — even if anything above ever misbehaves,
  //    the loading screen CANNOT run forever (max ~12s → login)
  useEffect(() => {
    const watchdog = setTimeout(() => onCompleteRef.current(), 12000);
    return () => clearTimeout(watchdog);
  }, []);

  // status text follows progress
  useEffect(() => {
    setStatus(msgs[Math.min(Math.floor((progress / 100) * msgs.length), msgs.length - 1)]);
  }, [progress]);

  return (
    <motion.div 
      className="fixed inset-0 z-200 bg-[#020408] flex flex-col items-center justify-center overflow-hidden"
      exit={{ opacity: 0, scale: 1.08, filter: 'blur(20px)', transition: { duration: 1.2, ease: morphEase } }}
    >
      <ConstellationBackground color="#22c55e" />
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at center, transparent 0%, #020408 65%)' }} />

      <div className="mb-16 relative z-10">
        <NeuralEye size={300} color="#22c55e" />
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="text-center z-10">
        <h1 className="text-5xl md:text-7xl font-bold font-orbitron tracking-[0.3em] neon-text-green" style={{ color: '#22c55e' }}>ALL EYES X</h1>
        <p className="text-green-500/40 font-mono-data tracking-[0.4em] text-[11px] uppercase mt-3">Black Cortex Universal Control</p>
      </motion.div>

      <div className="mt-20 w-72 md:w-[420px] z-10">
        <div className="h-[3px] w-full bg-green-500/10 rounded-full overflow-hidden border border-green-500/10">
          <motion.div className="h-full bg-gradient-to-r from-green-600 via-green-400 to-green-500" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex justify-between items-center mt-3">
          <span className="text-[9px] font-mono-data text-green-500/50 uppercase tracking-tighter">{status}</span>
          <span className="text-sm font-mono-data text-green-500 font-bold">{progress}%</span>
        </div>
        {progress === 100 && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center mt-3 text-[10px] text-green-400 font-orbitron uppercase tracking-[0.4em]">Initiation Complete</motion.p>
        )}
      </div>
    </motion.div>
  );
};

const WelcomeGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { show } = useWelcome();
  // Pure render gate — NO effect here. The dismissal logic lives in AppContent,
  // which stays mounted, so it survives StrictMode's double-effect in dev.
  if (show) return <WelcomeExperience />;
  return <>{children}</>;
};

/**
 * Wraps a page in DashboardProvider using the header Target Node.
 * Without this, pages that call useDashboard() (Alert Center, Critical Chart
 * Analysis) receive an empty context and render nothing.
 */
const Scoped: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { selectedDevice } = useDevices();
  return (
    <DashboardProvider deviceId={selectedDevice?.id ?? null}>
      {children}
    </DashboardProvider>
  );
};

const AppContent: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const location = useLocation();
  const { show, dismiss, reset } = useWelcome();
  const lastPath = useRef(location.pathname);

  // REAL navigation (sidebar click) hides Welcome for this session.
  // StrictMode-proof: on mount lastPath === current path → no dismiss.
  React.useEffect(() => {
    if (lastPath.current === location.pathname) return;
    lastPath.current = location.pathname;
    if (show) dismiss();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, show]);

  // Welcome reappears on every successful login
  React.useEffect(() => {
    if (isAuthenticated) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  if (isLoading) return <LoadingScreen onComplete={() => setIsLoading(false)} />;

  return (
    <AnimatePresence mode="wait">
      {!isAuthenticated ? (
        <motion.div
          key="login"
          initial={{ opacity: 0, scale: 0.92, filter: 'blur(15px)' }}
          animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, scale: 1.05, filter: 'blur(20px)' }}
          transition={{ duration: 0.9, ease: morphEase }}
        >
          <Login onLogin={() => setIsAuthenticated(true)} />
        </motion.div>
      ) : (
        <Layout onLogout={() => setIsAuthenticated(false)}>
          <AnimatePresence mode="wait">
            <Routes location={location} key={location.pathname}>

            

            {/* Dashboard supplies its own DashboardProvider so the header
                Target Node can scope the payload to one device. */}
            <Route
          path="/"
          element={
              <WelcomeGate>
                <Dashboard />
              </WelcomeGate>
          }
        />
              <Route path="/analysis" element={<Panel morph={MORPH_SLOW}><Analysis /></Panel>} />
              <Route path="/topology" element={<Panel morph={MORPH_SLOW}><Topology /></Panel>} />
              <Route path="/alerts" element={<Panel morph={MORPH_SLOW}><Scoped><AlertCenter /></Scoped></Panel>} />
              <Route path="/chart-analysis" element={<Panel morph={MORPH_SLOW}><Scoped><ChartAnalysis /></Scoped></Panel>} />
              <Route path="/devices" element={<Panel><Devices /></Panel>} />
              <Route path="/device/:id" element={<Panel><DeviceDetail /></Panel>} />
              <Route path="/live_monitor" element={<Panel><LiveMonitor /></Panel>} />
              <Route path="/terminal" element={<Panel><TerminalPage /></Panel>} />
              <Route path="/multi-shell" element={<Panel><MultiShell /></Panel>} />
              <Route path="/device-wall" element={<Panel><DeviceWall /></Panel>} />
              <Route path="/webcam" element={<Panel><WebcamPanel /></Panel>} />
              <Route path="/touch_monitor" element={<Panel><TouchMonitor /></Panel>} />
              <Route path="/p2p_share" element={<Panel><P2PShare /></Panel>} />
              <Route path="/security" element={<Panel><Security /></Panel>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AnimatePresence>
          <NotificationCenter />
        </Layout>
      )}
    </AnimatePresence>
  );
};

const App = () => {
  return (
    <BrowserRouter>
      <SocketProvider>
        <DeviceProvider>
          <WelcomeProvider>
            <AppContent />
          </WelcomeProvider>
        </DeviceProvider>
      </SocketProvider>
    </BrowserRouter>
  );
};

export default App;