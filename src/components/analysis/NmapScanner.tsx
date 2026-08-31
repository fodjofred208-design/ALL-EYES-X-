import { useState, useEffect, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import { useSocket } from '../../context/SocketContext';
import { useDevices } from '../../context/DeviceContext';
import { apiFetch, API_BASE } from '../../utils/api';

/**
 * Authorized Nmap scanner.
 *
 * Moved here from the Security page: nmap is an investigative network-exposure
 * tool, so it belongs in Analysis -> Port Analysis rather than sitting beside
 * security posture scores. The component is self-contained and uses the same
 * /api/security/nmap/* service and scan history as before - nothing was
 * reimplemented, only relocated.
 *
 * Scans are queued to an agent by explicit operator action. Nothing here starts
 * a scan automatically.
 */

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

const NmapScanner = () => {
  const { socket } = useSocket();
  const { devices } = useDevices();
  const [nmapDeviceId, setNmapDeviceId] = useState('');
  const [nmapTarget, setNmapTarget] = useState('');
  const [nmapScanType, setNmapScanType] = useState('top_ports');
  const [nmapMessage, setNmapMessage] = useState('');
  const [nmapScans, setNmapScans] = useState<NmapScan[]>([]);
  const [expandedScan, setExpandedScan] = useState<string | null>(null);

  const fetchNmapScans = useCallback(async () => {
    try {
      const data = await apiFetch<{ scans: NmapScan[] }>('/api/security/nmap/scans');
      setNmapScans(data.scans || []);
    } catch {
      // Not authenticated or backend unavailable; keep the panel quiet.
    }
  }, []);

  useEffect(() => {
    fetchNmapScans();
    // While a scan is still queued the agent has not reported back yet; keep
    // polling until it lands instead of waiting for the slow 10s cycle.
    const interval = setInterval(fetchNmapScans, 10000);
    return () => clearInterval(interval);
  }, [fetchNmapScans]);

  useEffect(() => {
    if (!socket) return;
    socket.on('nmap_scan_update', fetchNmapScans);
    return () => { socket.off('nmap_scan_update', fetchNmapScans); };
  }, [socket, fetchNmapScans]);

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

  return (
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
  );
};

export default NmapScanner;
