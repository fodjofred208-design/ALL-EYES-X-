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
  Clock,
  ChevronDown
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

interface NmapScan {
  scan_id: string;
  device_id: string;
  hostname?: string;
  scan_type: string;
  target: string;
  status: string;
  result?: string;
  error?: string;
  queued_at?: string;
  completed_at?: string;
  parsed?: { open_ports?: Array<{ host?: string; port: number; protocol: string; state?: string; service?: string; product?: string; version?: string }> };
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
  const [nmapDeviceId, setNmapDeviceId] = useState('');
  const [nmapTarget, setNmapTarget] = useState('');
  const [nmapScanType, setNmapScanType] = useState('top_ports');
  const [nmapMessage, setNmapMessage] = useState('');
  const [nmapScans, setNmapScans] = useState<NmapScan[]>([]);
  const [expandedScan, setExpandedScan] = useState<string | null>(null);

  // --- Network discovery (host sweep on the server's own network) ---
  const [discTarget, setDiscTarget] = useState('');
  const [discRunning, setDiscRunning] = useState(false);
  const [discError, setDiscError] = useState('');
  const [discResult, setDiscResult] = useState<{ scan_id: string; network: string; hosts: any[] } | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);

  const fetchSecurity = useCallback(async () => {
    try {
      const data = await apiFetch('/api/security/assessment');
      setSecurityData(data as SecurityData);
    } catch {
      // Silent
    }
  }, []);

  const fetchNmapScans = useCallback(async () => {
    try {
      const data = await apiFetch<{ scans: NmapScan[] }>('/api/security/nmap/scans');
      setNmapScans(data.scans || []);
    } catch {
      // Not authenticated or backend unavailable; keep current panel quiet.
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
    fetchNmapScans();
    // While a scan is still queued the agent has not reported back yet; keep
    // polling until it lands instead of waiting for the slow 10s cycle.
    fetchTimeline();
    const interval = setInterval(() => {
      fetchSecurity();
      fetchNmapScans();
      fetchTimeline();
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchSecurity, fetchNmapScans, fetchTimeline]);

  // Real-time refresh
  useEffect(() => {
    if (!socket) return;
    socket.on('devices_updated', fetchSecurity);
    socket.on('nmap_scan_update', fetchNmapScans);
    socket.on('nmap_scan_update', fetchTimeline);
    socket.on('new_alert', fetchTimeline);
    return () => {
      socket.off('devices_updated', fetchSecurity);
      socket.off('nmap_scan_update', fetchNmapScans);
      socket.off('nmap_scan_update', fetchTimeline);
      socket.off('new_alert', fetchTimeline);
    };
  }, [socket, fetchSecurity, fetchNmapScans, fetchTimeline]);

  const startScan = () => {
    setIsScanning(true);
    setTimeout(() => {
      fetchSecurity();
      setIsScanning(false);
    }, 3000);
  };

  /** Host sweep on the server's own network (LAN / Tailscale). */
  const runDiscovery = async () => {
    const target = discTarget.trim();
    if (!target) return;
    setDiscRunning(true);
    setDiscError('');
    try {
      const res = await fetch(`${API_BASE}/api/discovery/network`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setDiscResult({ scan_id: data.scan_id, network: data.network, hosts: data.hosts || [] });
      } else {
        setDiscResult(null);
        setDiscError(data.error || data.hint || `Discovery failed (${res.status})`);
      }
    } catch (e) {
      setDiscResult(null);
      setDiscError(e instanceof Error ? e.message : 'Discovery request failed');
    } finally {
      setDiscRunning(false);
    }
  };

  const startNmapScan = async () => {
    const deviceId = nmapDeviceId || devices[0]?.id || '';
    if (!deviceId) {
      setNmapMessage('Select a device first.');
      return;
    }
    if (!nmapTarget.trim()) {
      setNmapMessage('Enter a private/Tailscale target, for example 192.168.1.10 or 192.168.1.0/24.');
      return;
    }
    setNmapMessage('Queuing authorized Nmap scan...');
    try {
      const data = await apiFetch<{ scan_id: string; status: string }>('/api/security/nmap/scan', {
        method: 'POST',
        body: JSON.stringify({ device_id: deviceId, target: nmapTarget.trim(), scan_type: nmapScanType }),
      });
      setNmapMessage(`Scan queued: ${data.scan_id.slice(0, 8)} (${data.status})`);
      fetchNmapScans();
    } catch (err) {
      setNmapMessage(err instanceof Error ? err.message : 'Failed to queue Nmap scan');
    }
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

      {/* ---------- NETWORK DISCOVERY ---------- */}
      <div className="glass-card p-6 border border-cyan-500/20">
        <h3 className="text-lg font-orbitron text-white uppercase tracking-wider">Network Discovery</h3>
        <p className="text-[11px] text-slate-500 mt-1 font-rajdhani">
          Sweeps your own LAN / Tailscale range from the server and lists every host it finds,
          including machines that have no agent installed yet. Private and Tailscale ranges only.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            value={discTarget}
            onChange={(e) => setDiscTarget(e.target.value)}
            placeholder="192.168.1.0/24  or  100.64.0.0/10"
            className="flex-1 min-w-[220px] bg-black/40 border border-cyan-500/20 rounded-xl px-3 py-2 text-[11px] font-mono-data text-cyan-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50"
          />
          <button
            onClick={runDiscovery}
            disabled={discRunning || !discTarget.trim()}
            className="px-4 py-2 rounded-xl bg-cyan-600/20 border border-cyan-500/40 text-cyan-200 hover:bg-cyan-600 hover:text-white transition-all text-[10px] font-orbitron uppercase disabled:opacity-40"
          >
            {discRunning ? 'Scanning…' : 'Discover hosts'}
          </button>
          {discResult && (
            <a
              href={`${API_BASE}/api/discovery/scan/${discResult.scan_id}/download`}
              className="px-4 py-2 rounded-xl border border-white/10 text-[10px] font-orbitron uppercase text-slate-400 hover:text-green-400 hover:border-green-500/40 transition-all"
            >
              Download .txt
            </a>
          )}
        </div>

        {discError && <p className="mt-3 text-[10px] font-mono-data text-red-400">{discError}</p>}

        {discResult && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {discResult.hosts.length === 0 && (
              <p className="text-[10px] font-mono-data text-slate-600">No hosts answered on {discResult.network}.</p>
            )}
            {discResult.hosts.map((h: any) => (
              <div key={h.ip} className="p-3 rounded-xl bg-black/30 border border-white/5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-mono-data text-slate-200 truncate">{h.ip}</p>
                  <p className="text-[10px] font-mono-data text-slate-500 truncate">
                    {h.hostname || 'no hostname'} · {h.state}
                  </p>
                </div>
                <span className={`text-[8px] font-orbitron uppercase shrink-0 ${
                  h.agent_installed ? 'text-green-400' : 'text-amber-400'
                }`}>
                  {h.agent_installed ? 'agent installed' : 'no agent'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="glass-card p-6 border border-green-500/10">
        <div className="flex flex-col lg:flex-row lg:items-end gap-4 justify-between">
          <div className="flex-1">
            <h3 className="text-lg font-orbitron text-white uppercase tracking-wider">Authorized Nmap Scanner</h3>
            <p className="text-[11px] text-slate-500 mt-1 font-rajdhani">
              Scans are queued to a selected agent, limited to private/Tailscale targets, stored in the database, and audited.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 flex-[2]">
            <select
              value={nmapDeviceId}
              onChange={(e) => setNmapDeviceId(e.target.value)}
              className="bg-black/40 border border-green-500/20 rounded-xl px-3 py-2 text-xs text-green-400 font-orbitron"
            >
              <option value="">SELECT AGENT</option>
              {devices.map(d => <option key={d.id} value={d.id}>{d.hostname}</option>)}
            </select>
            <input
              value={nmapTarget}
              onChange={(e) => setNmapTarget(e.target.value)}
              placeholder="192.168.1.10 or 192.168.1.0/24"
              className="bg-black/40 border border-green-500/20 rounded-xl px-3 py-2 text-xs text-green-400 font-mono-data placeholder-green-900"
            />
            <select
              value={nmapScanType}
              onChange={(e) => setNmapScanType(e.target.value)}
              className="bg-black/40 border border-green-500/20 rounded-xl px-3 py-2 text-xs text-green-400 font-orbitron"
            >
              <option value="ping">Ping discovery</option>
              <option value="top_ports">Top ports</option>
              <option value="service">Service/version</option>
              <option value="os">OS guess</option>
              <option value="udp_light">Light UDP</option>
              <option value="vuln_safe">Safe vuln scripts</option>
            </select>
            <button
              onClick={startNmapScan}
              className="px-4 py-2 bg-green-600/10 border border-green-500/50 text-green-400 rounded-xl hover:bg-green-600 hover:text-white transition-all font-orbitron text-xs font-bold"
            >
              START NMAP
            </button>
          </div>
        </div>
        {nmapMessage && <p className="mt-3 text-[11px] font-mono-data text-green-400">{nmapMessage}</p>}
        <div className="mt-5 space-y-2">
          {nmapScans.slice(0, 8).map(scan => {
            const ports = scan.parsed?.open_ports ?? [];
            const isOpen = expandedScan === scan.scan_id;
            const running = scan.status !== 'completed' && scan.status !== 'failed';
            return (
              <div key={scan.scan_id} className="rounded-xl bg-black/30 border border-white/5 overflow-hidden">
                {/* row header — click to expand the full port table */}
                <button
                  onClick={() => setExpandedScan(isOpen ? null : scan.scan_id)}
                  className="w-full p-3 flex items-center justify-between gap-3 text-left hover:bg-white/[0.03] transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-orbitron text-white uppercase truncate">
                      {scan.scan_type} → {scan.target}
                    </p>
                    <p className="text-[10px] text-slate-500 font-mono-data truncate">
                      {scan.hostname || scan.device_id} · {scan.scan_id.slice(0, 8)}
                      {scan.completed_at ? ` · ${scan.completed_at.slice(11, 19)}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {ports.length > 0 && (
                      <span className="text-[10px] font-mono-data text-slate-400">{ports.length} open</span>
                    )}
                    <span className={`text-[10px] font-orbitron uppercase ${
                      scan.status === 'completed' ? 'text-green-400'
                        : scan.status === 'failed' ? 'text-red-400' : 'text-yellow-400'
                    }`}>
                      {running ? 'running…' : scan.status}
                    </span>
                    <ChevronDown size={14} className={`text-slate-600 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {scan.error && (
                  <p className="px-3 pb-2 text-[10px] text-red-400 font-mono-data">{scan.error}</p>
                )}

                {/* collapsed summary */}
                {!isOpen && ports.length > 0 && (
                  <p className="px-3 pb-3 text-[10px] text-slate-500 font-mono-data truncate">
                    {ports.slice(0, 6).map(pt => `${pt.port}/${pt.protocol}${pt.service ? ` ${pt.service}` : ''}`).join(', ')}
                    {ports.length > 6 ? ` +${ports.length - 6} more` : ''}
                  </p>
                )}

                {/* expanded: full port table + report download */}
                {isOpen && (
                  <div className="px-3 pb-3">
                    {ports.length === 0 ? (
                      <p className="text-[10px] text-slate-600 font-mono-data py-2">
                        {running ? 'Waiting for the agent to report back…' : 'No open ports reported.'}
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="text-[9px] font-orbitron text-slate-500 uppercase tracking-widest border-b border-white/5">
                              <th className="py-1.5 pr-3">Port</th>
                              <th className="py-1.5 pr-3">Proto</th>
                              <th className="py-1.5 pr-3">State</th>
                              <th className="py-1.5 pr-3">Service</th>
                              <th className="py-1.5">Version</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ports.map((pt, i) => (
                              <tr key={i} className="border-b border-white/5 last:border-0">
                                <td className="py-1.5 pr-3 text-[10px] font-mono-data text-green-400">{pt.port}</td>
                                <td className="py-1.5 pr-3 text-[10px] font-mono-data text-slate-400">{pt.protocol}</td>
                                <td className="py-1.5 pr-3 text-[10px] font-mono-data text-slate-400">{pt.state || 'open'}</td>
                                <td className="py-1.5 pr-3 text-[10px] font-mono-data text-slate-300">{pt.service || '—'}</td>
                                <td className="py-1.5 text-[10px] font-mono-data text-slate-500">
                                  {[pt.product, pt.version].filter(Boolean).join(' ') || '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <div className="mt-3 flex gap-2">
                      <a
                        href={`${API_BASE}/api/discovery/scan/${scan.scan_id}/download`}
                        className="px-3 py-1.5 rounded-lg border border-green-500/30 text-[9px] font-orbitron uppercase text-green-400 hover:bg-green-600 hover:text-white transition-all"
                      >
                        Download report
                      </a>
                      <button
                        onClick={fetchNmapScans}
                        className="px-3 py-1.5 rounded-lg border border-white/10 text-[9px] font-orbitron uppercase text-slate-400 hover:text-white transition-all"
                      >
                        Refresh
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {nmapScans.length === 0 && <p className="text-xs text-slate-600 font-rajdhani">No Nmap scans recorded yet.</p>}
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