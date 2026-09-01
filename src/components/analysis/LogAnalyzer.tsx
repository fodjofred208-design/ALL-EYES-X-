import React, { useCallback, useMemo, useState } from 'react';
import { API_BASE } from '../../utils/api';
import { usePolling } from '../../hooks/usePolling';

/**
 * Log Analyzer — operating-system log events shipped by the agent.
 *
 * Events come from journalctl (Linux), Get-WinEvent (Windows) or `log show`
 * (macOS). Nothing is synthesised: if a device reports no events, its sensor
 * status is shown, because "no events" and "cannot read the journal" mean
 * different things and must not look the same.
 */

const SEV_COLOR: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  info: '#38bdf8',
  low: '#22c55e',
  warning: '#eab308',
  error: '#f97316',
};

const SEVERITIES = ['all', 'critical', 'high', 'medium', 'info'] as const;

const LogAnalyzer: React.FC<{ deviceId?: string }> = ({ deviceId }) => {
  const [data, setData] = useState<any>(null);
  const [severity, setSeverity] = useState<string>('all');
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (deviceId) params.set('device_id', deviceId);
    if (severity && severity !== 'all') params.set('severity', severity);
    if (q.trim()) params.set('q', q.trim());
    const qs = params.toString();
    try {
      const res = await fetch(`${API_BASE}/api/analysis/logs${qs ? `?${qs}` : ''}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'fetch failed');
    }
  }, [deviceId, severity, q]);

  usePolling(load, 30000);

  const events: any[] = useMemo(() => data?.events ?? [], [data]);

  if (error) {
    return (
      <div className="rounded-lg border border-dashed border-red-500/30 bg-red-500/[0.05] p-5 text-center">
        <p className="text-[10px] font-orbitron uppercase tracking-[0.18em] text-red-300">
          Analysis engine unavailable
        </p>
        <p className="mt-2 text-[10px] font-mono-data text-slate-500">{error}</p>
      </div>
    );
  }

  if (!data?.total) {
    return (
      <div className="rounded-lg border border-dashed border-slate-600/40 bg-slate-900/30 p-5 text-center">
        <p className="text-[10px] font-orbitron uppercase tracking-[0.18em] text-slate-500">
          No log events stored
        </p>
        <p className="mt-2 text-[10px] font-mono-data text-slate-600 leading-relaxed">
          The agent ships OS log events every 60 seconds. If a device reports none,
          the usual cause is journal permissions — on Linux the agent user must be in
          the <span className="text-slate-400">systemd-journal</span> or{' '}
          <span className="text-slate-400">adm</span> group.
        </p>
      </div>
    );
  }

  const counts: Record<string, number> = data.counts_by_severity ?? {};

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {SEVERITIES.map(sv => (
          <button key={sv} onClick={() => setSeverity(sv)}
            className={`px-2.5 py-1 rounded-md border text-[9px] font-orbitron uppercase tracking-[0.14em] transition-all ${
              severity === sv ? 'border-green-500/40 bg-green-500/10 text-green-300'
                              : 'border-white/10 text-slate-500 hover:text-slate-300'}`}
            style={severity === sv && sv !== 'all' ? { borderColor: `${SEV_COLOR[sv]}66`, color: SEV_COLOR[sv] } : undefined}>
            {sv}{sv !== 'all' && counts[sv] ? ` (${counts[sv]})` : ''}
          </button>
        ))}
        <input
          value={q} onChange={e => setQ(e.target.value)}
          placeholder="Search message or unit..."
          className="flex-1 min-w-[150px] px-3 py-1.5 bg-slate-900/60 border border-white/10 rounded text-[11px] font-mono-data text-slate-200 placeholder-slate-600 focus:outline-none focus:border-green-500/40"
        />
      </div>

      <div className="overflow-x-auto aeyes-scroll rounded-md border border-white/5 max-h-[360px] overflow-y-auto">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-slate-900/95">
            <tr className="border-b border-white/5">
              {['Time', 'Sev', 'Device', 'Unit', 'Event', 'Message'].map(h => (
                <th key={h} className="py-2 px-3 text-[8px] font-orbitron uppercase tracking-[0.16em] text-slate-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {events.map((e, i) => (
              <tr key={e.id ?? i} className="border-b border-white/5 align-top">
                <td className="py-1.5 px-3 text-[9px] font-mono-data text-slate-400 whitespace-nowrap">
                  {String(e.ts || '').replace('T', ' ').slice(0, 19) || '—'}
                </td>
                <td className="py-1.5 px-3">
                  <span className="text-[9px] font-orbitron uppercase"
                    style={{ color: SEV_COLOR[String(e.severity).toLowerCase()] ?? '#94a3b8' }}>
                    {e.severity || 'info'}
                  </span>
                </td>
                <td className="py-1.5 px-3 text-[10px] font-rajdhani text-slate-200 whitespace-nowrap">{e.hostname}</td>
                <td className="py-1.5 px-3 text-[9px] font-mono-data text-slate-400">{e.unit || '—'}</td>
                <td className="py-1.5 px-3 text-[9px] font-mono-data text-slate-500">{e.event_id || '—'}</td>
                <td className="py-1.5 px-3 text-[10px] font-mono-data text-slate-300 break-words max-w-[520px]">
                  {e.message}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[9px] font-mono-data text-slate-600">
        {data.total} event(s) shown · {data.devices_reporting} device(s) reporting · {data.note}
      </p>
    </div>
  );
};

export default LogAnalyzer;
