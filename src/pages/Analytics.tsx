import { useState, useEffect, useCallback } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  LineChart, 
  Line,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { Download, Share2, Calendar, RefreshCw, Zap, Signal } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocket } from '../context/SocketContext';
import { apiFetch } from '../utils/api';
import { usePolling } from '../hooks/usePolling';

const COLORS = ['#22c55e', '#00d4ff', '#ef4444', '#eab308'];

const Analytics = () => {
  const [hasData, setHasData] = useState(false);
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { socket } = useSocket();

  const fetchAnalytics = useCallback(async () => {
    try {
      const data = await apiFetch('/api/analytics');
      setAnalyticsData(data);
      setHasData(data.total_devices > 0);
    } catch {
      // Silent
    } finally {
      setLoading(false);
    }
  }, []);

  // Pauses while the tab is hidden.
  usePolling(fetchAnalytics, 5000);

  // Real-time refresh via SocketIO
  useEffect(() => {
    if (!socket) return;
    socket.on('devices_updated', fetchAnalytics);
    return () => { socket.off('devices_updated', fetchAnalytics); };
  }, [socket, fetchAnalytics]);

  // Build chart data from real analytics only. Unknown metrics stay at 0 instead of being simulated.
  const hardwareUsage = analyticsData?.timeline
    ? analyticsData.timeline.labels.map((label: string) => ({
        name: label,
        cpu: 0,
        ram: 0,
        disk: 0,
      }))
    : [];

  const trafficData = analyticsData?.os_chart
    ? analyticsData.os_chart.labels.map((label: string, i: number) => ({
        name: label,
        value: analyticsData.os_chart.values[i] || 0,
      }))
    : [];

  return (
    <div className="max-w-7xl mx-auto space-y-8 p-4 relative">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-orbitron tracking-tight text-white uppercase">
            Neural <span className="text-green-500">Analytics</span>
          </h1>
          <p className="text-slate-400 font-rajdhani uppercase text-xs tracking-widest mt-1">Global Stream Intelligence</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={fetchAnalytics} className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-[10px] font-orbitron text-slate-400 hover:text-white transition-all uppercase">
            <RefreshCw size={14} />
            Refresh
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-green-600/10 border border-green-500/50 rounded-xl text-[10px] font-orbitron text-green-500 hover:bg-green-600 hover:text-white transition-all uppercase">
            <Download size={14} />
            Export Intel
          </button>
        </div>
      </div>

      <AnimatePresence>
        {loading && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#060812]/90 backdrop-blur-md rounded-2xl min-h-[600px]"
          >
             <div className="relative mb-8">
                <Signal size={80} className="text-slate-900" />
                <motion.div 
                  className="absolute inset-0 flex items-center justify-center"
                  animate={{ opacity: [0, 1, 0] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                   <Zap size={40} className="text-green-500" />
                </motion.div>
             </div>
             <div className="text-center space-y-2">
                <h2 className="text-2xl font-orbitron text-green-500 tracking-[0.4em] uppercase">Waiting for devices...</h2>
                <p className="text-slate-600 font-rajdhani text-sm uppercase tracking-widest italic">Neural uplink in progress. Establishing communication with Black Cortex nodes.</p>
             </div>
             <div className="mt-8 flex gap-4">
                {[...Array(3)].map((_, i) => (
                  <motion.div 
                    key={i}
                    className="w-2 h-2 rounded-full bg-green-500"
                    animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                  />
                ))}
             </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={`grid grid-cols-1 lg:grid-cols-2 gap-8 transition-all duration-1000 ${hasData ? 'blur-0' : 'blur-xl'}`}>
        {/* Resource Usage Line Chart */}
        <div className="glass-card p-6">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-sm font-orbitron text-white uppercase tracking-widest">Hardware Telemetry</h3>
            <RefreshCw size={16} className="text-slate-500 cursor-pointer hover:rotate-180 transition-transform duration-700" onClick={fetchAnalytics} />
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={hardwareUsage.length > 0 ? hardwareUsage : [{ name: '--', cpu: 0, ram: 0, disk: 0 }]}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                <XAxis dataKey="name" stroke="#ffffff10" fontSize={10} axisLine={false} tickLine={false} />
                <YAxis stroke="#ffffff10" fontSize={10} axisLine={false} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0a0e1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontFamily: 'Share Tech Mono' }}
                  itemStyle={{ fontSize: '12px' }}
                />
                <Line type="monotone" dataKey="cpu" stroke="#22c55e" strokeWidth={2} dot={false} name="CPU %" />
                <Line type="monotone" dataKey="ram" stroke="#00d4ff" strokeWidth={2} dot={false} name="RAM %" />
                <Line type="monotone" dataKey="disk" stroke="#ef4444" strokeWidth={2} dot={false} name="DISK %" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Traffic Distribution Bar Chart */}
        <div className="glass-card p-6">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-sm font-orbitron text-white uppercase tracking-widest">OS Distribution</h3>
            <Share2 size={16} className="text-slate-500 cursor-pointer" />
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trafficData.length > 0 ? trafficData : [{ name: 'No Data', value: 0 }]}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                <XAxis dataKey="name" stroke="#ffffff10" fontSize={10} axisLine={false} tickLine={false} />
                <YAxis stroke="#ffffff10" fontSize={10} axisLine={false} tickLine={false} />
                <Tooltip 
                  cursor={{ fill: '#ffffff05' }}
                  contentStyle={{ backgroundColor: '#0a0e1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontFamily: 'Share Tech Mono' }}
                />
                <Bar dataKey="value" fill="#22c55e" radius={[4, 4, 0, 0]}>
                   {trafficData.map((_: any, index: number) => (
                     <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                   ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Segmented Share Pie Chart */}
        <div className="glass-card p-6 lg:col-span-1">
          <h3 className="text-sm font-orbitron text-white mb-8 uppercase tracking-widest">Network Segmentation</h3>
          <div className="h-[250px] relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={trafficData.length > 0 ? trafficData : [{ name: 'Empty', value: 1 }]}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {trafficData.map((_: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
               <p className="text-sm font-bold font-orbitron text-white">{analyticsData?.total_devices || 0}</p>
               <p className="text-[8px] text-green-500 uppercase font-orbitron">Devices</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-6">
             {trafficData.map((item: any, index: number) => (
               <div key={item.name} className="flex items-center gap-3">
                 <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                 <span className="text-xs font-rajdhani text-slate-500 uppercase tracking-tighter">{item.name}</span>
               </div>
             ))}
          </div>
        </div>

        {/* Performance Overview */}
        <div className="glass-card p-6 lg:col-span-1">
          <h3 className="text-sm font-orbitron text-white mb-6 uppercase tracking-widest">Neural Performance</h3>
          <div className="space-y-6">
             {[
               { label: 'Total Devices', value: String(analyticsData?.total_devices || 0), color: '#22c55e' },
               { label: 'Online', value: String(analyticsData?.online_devices || 0), color: '#00d4ff' },
               { label: 'Average RAM', value: `${analyticsData?.average_ram || 0}GB`, color: '#8b5cf6' },
               { label: 'Sync Efficiency', value: `${analyticsData?.online_devices && analyticsData?.total_devices ? Math.round((analyticsData.online_devices / analyticsData.total_devices) * 100) : 0}%`, color: '#eab308' },
             ].map((item, i) => (
               <div key={i} className="space-y-2">
                 <div className="flex justify-between items-center text-[10px] font-orbitron uppercase tracking-widest">
                    <span className="text-slate-500">{item.label}</span>
                    <span style={{ color: item.color }}>{item.value}</span>
                 </div>
                 <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full"
                      style={{ backgroundColor: item.color }}
                      initial={{ width: 0 }}
                      animate={{ width: hasData ? '100%' : '0%' }}
                      transition={{ duration: 2, delay: i * 0.2 }}
                    />
                 </div>
               </div>
             ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Analytics;