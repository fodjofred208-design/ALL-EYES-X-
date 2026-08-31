import { useState } from 'react';
import { API_BASE } from '../../utils/api';

/**
 * Network discovery.
 *
 * Moved here from the Security page - discovery is device intelligence, so it
 * belongs in Analysis -> Devices Analysis. Same /api/discovery/network service,
 * same scan storage; only the location changed.
 *
 * Scans run only on explicit operator action.
 */

const NetworkDiscovery = () => {
  const [discTarget, setDiscTarget] = useState('');
  const [discRunning, setDiscRunning] = useState(false);
  const [discError, setDiscError] = useState('');
  const [discResult, setDiscResult] = useState<{ scan_id: string; network: string; hosts: any[] } | null>(null);

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

  return (
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
  );
};

export default NetworkDiscovery;
