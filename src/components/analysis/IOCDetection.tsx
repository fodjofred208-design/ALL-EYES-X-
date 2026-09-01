import React, { useCallback, useState } from 'react';
import { API_BASE } from '../../utils/api';
import { usePolling } from '../../hooks/usePolling';

/**
 * IOC detection.
 *
 * Indicators are analyst-supplied and matched only against data the agents
 * actually reported - log events and the connection table. No external
 * threat-intelligence feed is connected, and the panel says so plainly rather
 * than implying a result came from a feed it does not have.
 */

const SEV_COLOR: Record<string, string> = {
  critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e', info: '#38bdf8',
};

const TYPES = ['ip', 'domain', 'hash', 'process', 'url'] as const;

const IOCDetection: React.FC = () => {
  const [indicators, setIndicators] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [feedConnected, setFeedConnected] = useState(false);
  const [run, setRun] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const [form, setForm] = useState({ value: '', type: 'ip', severity: 'medium', note: '' });
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [i, m] = await Promise.all([
        fetch(`${API_BASE}/api/analysis/ioc/indicators`, { credentials: 'include' }),
        fetch(`${API_BASE}/api/analysis/ioc/matches`, { credentials: 'include' }),
      ]);
      if (i.ok) {
        const j = await i.json();
        setIndicators(j.indicators ?? []);
        setFeedConnected(Boolean(j.external_feed_connected));
      }
      if (m.ok) setMatches((await m.json()).matches ?? []);
    } catch { /* keep last known */ }
  }, []);

  usePolling(load, 45000);

  const addIndicator = async () => {
    if (!form.value.trim()) return;
    setMsg(null);
    try {
      const res = await fetch(`${API_BASE}/api/analysis/ioc/indicators`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setForm({ value: '', type: 'ip', severity: 'medium', note: '' });
        await load();
      } else {
        setMsg(body?.error || `Failed (${res.status})`);
      }
    } catch {
      setMsg('Request failed.');
    }
  };

  const runMatching = async () => {
    setRunning(true);
    setMsg(null);
    try {
      const res = await fetch(`${API_BASE}/api/analysis/ioc/run`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      if (res.ok) { setRun(await res.json()); await load(); }
    } catch { setMsg('Request failed.'); }
    finally { setRunning(false); }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-amber-500/20 bg-amber-500/[0.05] px-3 py-2 text-[10px] font-mono-data text-amber-200/80 leading-relaxed">
        {feedConnected
          ? 'An external threat-intelligence feed is connected; indicator sources name it.'
          : 'No external threat-intelligence feed is connected. Indicators below are analyst-supplied, '
            + 'and every match comes only from data the agents actually reported.'}
      </div>

      {/* add indicator */}
      <div className="flex flex-wrap items-end gap-2">
        <input
          value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
          placeholder="Indicator value (IP, domain, hash, process, URL)…"
          className="flex-1 min-w-[180px] px-3 py-1.5 bg-slate-900/60 border border-white/10 rounded text-[11px] font-mono-data text-slate-200 placeholder-slate-600 focus:outline-none focus:border-green-500/40"
        />
        <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
          className="px-2 py-1.5 bg-slate-900/60 border border-white/10 rounded text-[10px] font-mono-data text-slate-300">
          {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}
          className="px-2 py-1.5 bg-slate-900/60 border border-white/10 rounded text-[10px] font-mono-data text-slate-300">
          {['low', 'medium', 'high', 'critical'].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button onClick={addIndicator} disabled={!form.value.trim()}
          className="px-3 py-1.5 rounded-md border border-green-500/40 bg-green-500/10 text-[9px] font-orbitron uppercase tracking-[0.14em] text-green-300 hover:bg-green-500/20 transition-all disabled:opacity-40">
          Add
        </button>
        <button onClick={runMatching} disabled={running}
          className="px-3 py-1.5 rounded-md border border-white/10 text-[9px] font-orbitron uppercase tracking-[0.14em] text-slate-300 hover:text-green-300 hover:border-green-500/40 transition-all disabled:opacity-50">
          {running ? 'Matching…' : 'Run matching'}
        </button>
      </div>

      {msg && <p className="text-[10px] font-mono-data text-amber-300">{msg}</p>}

      {run && (
        <div className="rounded-md border border-white/5 bg-slate-900/30 px-3 py-2 text-[10px] font-mono-data text-slate-400">
          Checked {run.indicators_checked} indicator(s) against {run.logs_scanned} log event(s) and{' '}
          {run.connections_scanned} connection(s) · {run.new_matches} new match(es)
        </div>
      )}

      {/* indicators */}
      <div>
        <p className="text-[9px] font-orbitron uppercase tracking-[0.16em] text-slate-500 mb-2">
          Indicators ({indicators.length})
        </p>
        {indicators.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-600/40 bg-slate-900/30 p-4 text-center">
            <p className="text-[10px] font-mono-data text-slate-600">
              No indicators yet. Add one above to start matching against collected data.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto aeyes-scroll rounded-md border border-white/5">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/5">
                  {['Severity', 'Type', 'Value', 'Source', 'Confidence'].map(h => (
                    <th key={h} className="py-2 px-3 text-[8px] font-orbitron uppercase tracking-[0.16em] text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {indicators.map(i => (
                  <tr key={i.id} className="border-b border-white/5">
                    <td className="py-1.5 px-3 text-[9px] font-orbitron uppercase"
                      style={{ color: SEV_COLOR[String(i.severity).toLowerCase()] ?? '#94a3b8' }}>
                      {i.severity}
                    </td>
                    <td className="py-1.5 px-3 text-[9px] font-orbitron uppercase text-slate-400">{i.type}</td>
                    <td className="py-1.5 px-3 text-[11px] font-mono-data text-slate-200" title={i.note || ''}>{i.value}</td>
                    <td className="py-1.5 px-3 text-[9px] font-mono-data text-slate-400">{i.source}</td>
                    <td className="py-1.5 px-3 text-[9px] font-mono-data text-slate-400">{i.confidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* matches */}
      <div>
        <p className="text-[9px] font-orbitron uppercase tracking-[0.16em] text-slate-500 mb-2">
          Matches ({matches.length})
        </p>
        {matches.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-600/40 bg-slate-900/30 p-4 text-center">
            <p className="text-[10px] font-mono-data text-slate-600">
              No matches. An indicator only produces a match when its value genuinely
              appears in collected logs or connections.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto aeyes-scroll rounded-md border border-white/5 max-h-[300px] overflow-y-auto">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-slate-900/95">
                <tr className="border-b border-white/5">
                  {['Severity', 'Indicator', 'Found in', 'Device', 'Detail'].map(h => (
                    <th key={h} className="py-2 px-3 text-[8px] font-orbitron uppercase tracking-[0.16em] text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matches.map((m, i) => (
                  <tr key={m.id ?? i} className="border-b border-white/5 align-top">
                    <td className="py-1.5 px-3 text-[9px] font-orbitron uppercase"
                      style={{ color: SEV_COLOR[String(m.severity).toLowerCase()] ?? '#94a3b8' }}>
                      {m.severity}
                    </td>
                    <td className="py-1.5 px-3 text-[10px] font-mono-data text-slate-200">
                      {m.value} <span className="text-slate-600">({m.type})</span>
                    </td>
                    <td className="py-1.5 px-3 text-[9px] font-orbitron uppercase text-cyan-300">{m.where_found}</td>
                    <td className="py-1.5 px-3 text-[10px] font-rajdhani text-slate-300">{m.hostname}</td>
                    <td className="py-1.5 px-3 text-[10px] font-mono-data text-slate-400 break-words max-w-[420px]">{m.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default IOCDetection;
