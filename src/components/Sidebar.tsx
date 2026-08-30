import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, BarChart3, Monitor, Terminal, ShieldAlert, Cpu, Camera, Share2, MousePointer2,
  Menu, X, LogOut, Eye } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import NeuralEye from './NeuralEye';
import DeviceSelector from './DeviceSelector';
import { API_BASE } from '../utils/api';

const menuItems = [
  { icon: LayoutDashboard, label: 'Command Center', path: '/' },
  { icon: Cpu, label: 'Devices', path: '/devices' },
  { icon: BarChart3, label: 'Analytics', path: '/analytics' },
  { icon: Monitor, label: 'Live Monitor', path: '/live_monitor' },
  { icon: MousePointer2, label: 'Touch Control', path: '/touch_monitor' },
  { icon: Terminal, label: 'Terminal', path: '/terminal' },
  { icon: Camera, label: 'Webcam', path: '/webcam' },
  { icon: Share2, label: 'P2P Share', path: '/p2p_share' },
  { icon: ShieldAlert, label: 'Security', path: '/security' },
];

const Sidebar: React.FC<{ onLogout: () => void }> = ({ onLogout }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [time, setTime] = useState(new Date());

  // Live clock — shows actual server machine time
  useEffect(() => {
    const tick = () => setTime(new Date());
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (isOpen && !(e.target as Element).closest('#sidebar-root')) setIsOpen(false);
    };
    if (isOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  const fmt = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const fmtDate = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <>
      {/* ============ FIXED TOP BAR ============ */}
      <nav className="fixed top-0 left-0 right-0 h-16 bg-[#060812]/90 backdrop-blur-xl border-b border-white/5 z-[90] flex items-center justify-between px-5">
        <div className="flex items-center gap-4">
          <button onClick={() => setIsOpen(!isOpen)} className="p-2 rounded-lg bg-green-500/10 border border-green-500/30 text-green-500 hover:bg-green-600 hover:text-white transition-all">
            {isOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="hidden sm:flex items-center gap-2">
            <Eye className="text-green-500 animate-pulse" size={22} />
            <span className="font-orbitron font-bold text-white tracking-widest text-sm">ALL EYES X</span>
          </div>
          <div className="hidden md:block ml-6">
            <DeviceSelector />
          </div>
        </div>

        <div className="flex items-center gap-5">
          {/* Live Clock */}
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-[11px] font-mono-data text-green-400 tabular-nums">{fmt(time)}</span>
            <span className="text-[9px] font-mono-data text-slate-600">{fmtDate(time)}</span>
          </div>
          <div className="w-12 h-12 rounded-full border-2 border-green-500/20 p-1 cursor-pointer hover:border-green-500/50 transition-all">
            <NeuralEye size={40} color="#22c55e" />
          </div>
        </div>
      </nav>

      {/* ============ SLIDE-OUT SIDEBAR ============ */}
      <div id="sidebar-root" className="relative z-[95]">
        <AnimatePresence>
          {isOpen && (
            <motion.aside
              initial={{ x: -320, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -320, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed top-0 left-0 h-full w-72 bg-[#060812]/95 backdrop-blur-2xl border-r border-green-500/15 shadow-2xl flex flex-col pt-6 overflow-y-auto"
            >
              {/* Branding */}
              <div className="px-6 mb-8">
                <div className="flex items-center gap-3 mb-1">
                  <Eye className="text-green-500" size={26} />
                  <h2 className="text-xl font-bold font-orbitron text-white tracking-wider">ALL EYES X</h2>
                </div>
                <p className="text-[9px] text-green-500/50 font-orbitron uppercase tracking-[0.25em] ml-9">Dept. of Black Cortex Universal Control</p>
              </div>

              {/* Nav Links */}
              <nav className="flex-1 px-3 space-y-1">
                {menuItems.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={() => setIsOpen(false)}
                    className={({ isActive }) => `
                      flex items-center gap-4 px-4 py-3 rounded-xl transition-all group
                      ${isActive ? 'bg-green-500/10 text-green-400 border border-green-500/30' : 'text-slate-500 hover:text-slate-200 hover:bg-white/5 border border-transparent'}
                    `}
                  >
                    <item.icon size={18} />
                    <span className="font-orbitron font-semibold tracking-wider uppercase text-[10px]">{item.label}</span>
                  </NavLink>
                ))}
              </nav>

              {/* Footer info */}
              <div className="px-4 py-4 border-t border-white/5 space-y-3">
                <div className="flex items-center justify-between text-[9px] font-mono-data">
                  <span className="text-slate-600">Server</span>
                  <span className="text-green-500/60">{API_BASE.replace('http://', '')}</span>
                </div>
                <div className="flex items-center justify-between text-[9px] font-mono-data">
                  <span className="text-slate-600">Clock</span>
                  <span className="text-green-500/60 tabular-nums">{fmt(time)}</span>
                </div>
                <button
                  onClick={onLogout}
                  className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 rounded-xl text-red-500/60 hover:bg-red-500/10 hover:text-red-400 transition-all font-orbitron uppercase text-[10px] border border-transparent hover:border-red-500/20"
                >
                  <LogOut size={16} />
                  Disconnect
                </button>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </>
  );
};

export default Sidebar;
