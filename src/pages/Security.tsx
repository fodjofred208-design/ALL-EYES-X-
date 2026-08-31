import { useState, useEffect, useCallback } from 'react';
import BackButton from '../components/BackButton';
import { 
  ShieldCheck, 
  ShieldAlert, 
  Lock, 
  Unlock, 
  Activity, 
  AlertCircle, 
  CheckCircle2, 
  Zap,
  RefreshCw,
  Search,
  Clock
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { useSocket } from '../context/SocketContext';
import { useDevices } from '../context/DeviceContext';
import { apiFetch, API_BASE } from '../utils/api';

interface DeviceSecurity {
  device_id: string;
  hostname: string;
  ip_address: string;
  score: number;
  threat_level: string;
  alerts: string[];
  alert_count: number;
}

interface SecurityData {
  devices: DeviceSecurity[];
  overall_score: number;
  total_devices: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
}

interface TimelineEvent {
  timestamp?: string;
  actor?: string;
  device_id?: string;
  action?: string;
  event_type?: string;
  result?: string;
  details?: string;
  message?: string;
  severity?: string;
  source?: string;
}

const Security = () => {
  const [isScanning, setIsScanning] = useState(false);
  const [securityData, setSecurityData] = useState<SecurityData | null>(null);
  const { socket, isConnected } = useSocket();
  const { devices } = useDevices();

  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);

  const fetchSecurity = useCallback(async () => {
    try {
      const data = await apiFetch('/api/security/assessment');
      setSecurityData(data as SecurityData);
    } catch {
      // Silent
    }
  }, []);

  const fetchTimeline = useCallback(async () => {
    try {
      const data = await apiFetch<{ events: TimelineEvent[] }>('/api/security/timeline?limit=30');
      setTimeline(data.events || []);
    } catch {
      // Timeline remains empty when backend is unavailable.
    }
  }, []);

  useEffect(() => {
    fetchSecurity();
    fetchTimeline();
    const interval = setInterval(() => {
      fetchSecurity();
      fetchTimeline();
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchSecurity, fetchTimeline]);

  // Real-time refresh
  useEffect(() => {
    if (!socket) return;
    socket.on('devices_updated', fetchSecurity);
    socket.on('nmap_scan_update', fetchTimeline);
    socket.on('new_alert', fetchTimeline);
    return () => {
      socket.off('devices_updated', fetchSecurity);
      socket.off('nmap_scan_update', fetchTimeline);
      socket.off('new_alert', fetchTimeline);
    };
  }, [socket, fetchSecurity, fetchTimeline]);

  const startScan = () => {
    setIsScanning(true);
    setTimeout(() => {
      fetchSecurity();
      setIsScanning(false);
    }, 3000);
  };

  // Build chart data from reported device alerts only. No simulated threat counts.
  const securityChartData = devices.length > 0
    ? devices.map((d) => {
        const alertCount = Array.isArray(d.alerts) ? d.alerts.length : 0;
        return {
          time: d.hostname.slice(0, 8),
          threats: alertCount,
          blocked: 0,
        };
      })
    : [{ time: '00:00', threats: 0, blocked: 0 }];

  return (
    <div className="max-w-7xl mx-auto space-y-8 p-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <BackButton />
          <h1 className="text-3xl font-bold font-orbitron tracking-tight text-white uppercase">
            Threat <span className="text-green-500">Neutralization</span>
          </h1>
          <p className="text-slate-400 font-rajdhani text-xs tracking-widest mt-1 uppercase">Black Cortex Defensive Matrix</p>
        </div>
        <div className="flex items-center gap-3">
           <button 
             onClick={startScan}
             disabled={isScanning}
             className="flex items-center gap-2 px-6 py-2.5 bg-green-600/10 border border-green-500/50 text-green-500 rounded-xl hover:bg-green-600 hover:text-white transition-all font-orbitron text-xs font-bold disabled:opacity-50"
           >
            {isScanning ? <RefreshCw size={16} className="animate-spin" /> : <Search size={16} />}
            {isScanning ? 'SCANNING SYSTEM...' : 'INITIATE THREAT SCAN'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <div className="glass-card p-6 border-l-2 border-l-green-500">
            <div className="flex justify-between items-start">
               <div>
                  <p className="text-[10px] font-orbitron text-slate-500 uppercase mb-1">Security Score</p>
                  <h3 className="text-2xl font-bold font-rajdhani text-green-500">{securityData?.overall_score ?? '--'} / 100</h3>
               </div>
               <ShieldCheck className="text-green-500" />
            </div>
         </div>
         <div className="glass-card p-6 border-l-2 border-l-blue-500">
            <div className="flex justify-between items-start">
               <div>
                  <p className="text-[10px] font-orbitron text-slate-500 uppercase mb-1">Total Devices</p>
                  <h3 className="text-2xl font-bold font-rajdhani text-blue-500">{securityData?.total_devices ?? devices.length} ACTIVE</h3>
               </div>
               <Lock className="text-blue-500" />
            </div>
         </div>
         <div className="glass-card p-6 border-l-2 border-l-red-500">
            <div className="flex justify-between items-start">
               <div>
                  <p className="text-[10px] font-orbitron text-slate-500 uppercase mb-1">Critical Alerts</p>
                  <h3 className="text-2xl font-bold font-rajdhani text-red-500">{securityData?.critical_count ?? 0} DETECTED</h3>
               </div>
               <ShieldAlert className="text-red-500" />
            </div>
         </div>
      </div>

      <div className="glass-card p-6 border border-cyan-500/10">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-orbitron text-white uppercase tracking-wider flex items-center gap-2"><Clock size={18} className="text-cyan-300" /> Security Timeline</h3>
          <button onClick={fetchTimeline} className="text-[10px] font-orbitron text-cyan-300 border border-cyan-500/20 px-3 py-1 rounded">REFRESH</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-64 overflow-y-auto custom-scrollbar">
          {timeline.length === 0 ? (
            <p className="text-xs text-slate-600">No security timeline events reported yet.</p>
          ) : timeline.slice(0, 12).map((event, i) => (
            <div key={`${event.timestamp}-${i}`} className="p-3 rounded-xl bg-black/30 border border-white/5">
              <div className="flex justify-between gap-3">
                <p className="text-[10px] font-orbitron text-white uppercase">{event.event_type || event.action || event.source}</p>
                <span className="text-[9px] text-slate-600 font-mono-data">{event.source}</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1 font-mono-data">{event.timestamp || 'no timestamp'} · {event.actor || 'system'} · {event.device_id || 'global'}</p>
              <p className="text-[11px] text-slate-400 mt-2 font-rajdhani">{event.details || event.message || event.result || 'Event recorded'}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
         <div className="lg:col-span-2 glass-card p-6">
            <div className="flex justify-between items-center mb-10">
               <h3 className="text-lg font-orbitron text-white uppercase tracking-wider">Device Security Scores</h3>
               <div className="flex gap-4">
                  <div className="flex items-center gap-2">
                     <div className="w-2 h-2 rounded-full bg-green-500" />
                     <span className="text-[10px] font-orbitron text-slate-500 uppercase">Secure</span>
                  </div>
                  <div className="flex items-center gap-2">
                     <div className="w-2 h-2 rounded-full bg-red-500" />
                     <span className="text-[10px] font-orbitron text-slate-500 uppercase">At Risk</span>
                  </div>
               </div>
            </div>
            <div className="h-[350px]">
               <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={securityChartData}>
                     <defs>
                        <linearGradient id="colorThreats" x1="0" y1="0" x2="0" y2="1">
                           <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2}/>
                           <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorEliminated" x1="0" y1="0" x2="0" y2="1">
                           <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2}/>
                           <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                        </linearGradient>
                     </defs>
                     <XAxis dataKey="time" stroke="#ffffff05" fontSize={10} axisLine={false} tickLine={false} />
                     <YAxis stroke="#ffffff05" fontSize={10} axisLine={false} tickLine={false} />
                     <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#0a0e1a', 
                          border: '1px solid rgba(255,255,255,0.1)',
                          fontFamily: 'Share Tech Mono' 
                        }} 
                     />
                     <Area type="monotone" dataKey="threats" stroke="#ef4444" fillOpacity={1} fill="url(#colorThreats)" strokeWidth={2} name="Alerts" />
                     <Area type="monotone" dataKey="blocked" name="Secure" stroke="#22c55e" fillOpacity={1} fill="url(#colorEliminated)" strokeWidth={2} />
                  </AreaChart>
               </ResponsiveContainer>
            </div>
         </div>

         <div className="space-y-6">
            <div className="glass-card p-6 flex flex-col">
               <h3 className="text-sm font-orbitron text-white uppercase tracking-widest mb-8 border-b border-white/5 pb-4">
                  Device Security
               </h3>
               <div className="space-y-4">
                  {!securityData || securityData.devices.length === 0 ? (
                    <p className="text-slate-600 text-xs">No devices assessed</p>
                  ) : (
                    securityData.devices.slice(0, 4).map((d) => (
                      <div key={d.device_id} className="flex items-center gap-4">
                         <div className={`p-2 rounded-lg ${
                           d.score >= 80 ? 'bg-green-500/10 text-green-500' :
                           d.score >= 60 ? 'bg-yellow-500/10 text-yellow-500' :
                           'bg-red-500/10 text-red-500'
                         }`}>
                            {d.score >= 80 ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                         </div>
                         <div className="flex-1">
                            <p className="text-[10px] font-bold text-white uppercase font-orbitron">{d.hostname}</p>
                            <div className="mt-2 h-1 w-full bg-white/5 rounded-full overflow-hidden">
                               <div 
                                 className={`h-full rounded-full ${
                                   d.score >= 80 ? 'bg-green-500' :
                                   d.score >= 60 ? 'bg-yellow-500' :
                                   'bg-red-500'
                                 }`}
                                 style={{ width: `${d.score}%` }}
                               />
                            </div>
                         </div>
                         <span className={`text-xs font-bold ${
                           d.score >= 80 ? 'text-green-500' :
                           d.score >= 60 ? 'text-yellow-500' :
                           'text-red-500'
                         }`}>{d.score}</span>
                      </div>
                    ))
                  )}
               </div>
               
               <div className="mt-8 pt-6 border-t border-white/5">
                  <button 
                    className="w-full py-4 bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white border border-red-500/30 rounded-xl font-orbitron text-xs font-bold transition-all flex items-center justify-center gap-3 group"
                  >
                     <Unlock size={18} className="group-hover:rotate-12 transition-transform" />
                     EMERGENCY DISCONNECT
                  </button>
               </div>
            </div>

            <div className="glass-card p-6 bg-red-500/5 border-red-500/20">
               <div className="flex items-center gap-3 mb-4">
                  <Zap className="text-red-500" size={20} />
                  <h4 className="text-[10px] font-orbitron text-white uppercase">Threat Summary</h4>
               </div>
               <p className="text-[11px] text-slate-400 font-rajdhani leading-relaxed">
                  {securityData?.critical_count ? `${securityData.critical_count} critical, ${securityData.high_count} high threats detected.` : 'No active threats detected. All nodes secure.'}
               </p>
            </div>
         </div>
      </div>
    </div>
  );
};

export default Security;