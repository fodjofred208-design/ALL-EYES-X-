import React, { useCallback, useState } from 'react';
import { API_BASE } from '../../utils/api';
import { usePolling } from '../../hooks/usePolling';

/**
 * Sigma detection.
 *
 * Rules are evaluated in the backend, never here. A rule this engine does not
 * implement is shown as UNSUPPORTED with the reason, not as a rule that matched
 * nothing - a detection that appears to work but never fires is the worst
 * possible outcome for a detection engine.
 */

const LEVEL_COLOR: Record<string, string> = {
  critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e', info: '#38bdf8',
};

const SigmaDetection: React.FC = () => {
  const [rules, setRules] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [run, setRun] = useState<any>(null);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    try {
      const [r, m] = await Promise.all([
        fetch(`${API_BASE}/api/analysis/sigma/rules`, { credentials: 'include' }),
        fetch(`${API_BASE}/api/analysis/sigma/matches`, { credentials: 'include' }),
      ]);
      if (r.ok) setRules((await r.json()).rules ?? []);
      if (m.ok) setMatches((await m.json()).matches ?? []);
    } catch { /* keep last known */ }
  }, []);

  usePolling(load, 45000);

  const runRules = async () => {
    setRunning(true);
    try {
      const res = await fetch(`${API_BASE}/api/analysis/sigma/run`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      if (res.ok) {
        setRun(await res.json());
        await load();
      }
    } catch { /* surfaced below */ }
    finally { setRunning(false); }
  };

  const unsupported = rules.filter(r => r.status !== 'supported');

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-mono-data text-slate-500">
          {rules.length} rule(s) · {rules.filter(r => r.enabled).length} enabled ·{' '}
          {unsupported.length} unsupported
        </p>
        <button onClick={runRules} disabled={running}
          className="px-3 py-1.5 rounded-md border border-green-500/40 bg-green-500/10 text-[9px] font-orbitron uppercase tracking-[0.14em] text-green-300 hover:bg-green-500/20 transition-all disabled:opacity-50">
          {running ? 'Evaluating…' : 'Run rules'}
        </button>
      </div>

      {run && (
        <div className="rounded-md border border-white/5 bg-slate-900/30 px-3 py-2 text-[10px] font-mono-data text-slate-400">
          Scanned {run.events_scanned} event(s) · {run.rules_evaluated} rule(s) evaluated ·{' '}
          {run.rules_unsupported} unsupported · {run.new_matches} new detection(s)
        </div>
      )}

      <div>
        <p className="text-[9px] font-orbitron uppercase tracking-[0.16em] text-slate-500 mb-2">Rules</p>
        <div className="overflow-x-auto aeyes-scroll rounded-md border border-white/5">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/5">
                {['Level', 'Rule', 'Condition', 'Status'].map(h => (
                  <th key={h} className="py-2 px-3 text-[8px] font-orbitron uppercase tracking-[0.16em] text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rules.map(r => (
                <tr key={r.rule_id} className="border-b border-white/5">
                  <td className="py-1.5 px-3 text-[9px] font-orbitron uppercase"
                    style={{ color: LEVEL_COLOR[String(r.level).toLowerCase()] ?? '#94a3b8' }}>
                    {r.level || '—'}
                  </td>
                  <td className="py-1.5 px-3 text-[11px] font-rajdhani text-slate-200" title={r.description || ''}>
                    {r.title}
                  </td>
                  <td className="py-1.5 px-3 text-[9px] font-mono-data text-slate-400">{r.condition || '—'}</td>
                  <td className="py-1.5 px-3">
                    {r.status === 'supported' ? (
                      <span className="text-[9px] font-orbitron uppercase text-green-400">supported</span>
                    ) : (
                      <span className="text-[9px] font-orbitron uppercase text-amber-400" title={r.reason || ''}>
                        unsupported
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <p className="text-[9px] font-orbitron uppercase tracking-[0.16em] text-slate-500 mb-2">
          Detections ({matches.length})
        </p>
        {matches.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-600/40 bg-slate-900/30 p-4 text-center">
            <p className="text-[10px] font-mono-data text-slate-600">
              No detections yet. Rules match against stored log events, so a device must
              be shipping logs first.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto aeyes-scroll rounded-md border border-white/5 max-h-[300px] overflow-y-auto">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-slate-900/95">
                <tr className="border-b border-white/5">
                  {['Time', 'Level', 'Rule', 'Device', 'Unit', 'Matched event'].map(h => (
                    <th key={h} className="py-2 px-3 text-[8px] font-orbitron uppercase tracking-[0.16em] text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matches.map((m, i) => (
                  <tr key={m.id ?? i} className="border-b border-white/5 align-top">
                    <td className="py-1.5 px-3 text-[9px] font-mono-data text-slate-400 whitespace-nowrap">
                      {String(m.ts || '').replace('T', ' ').slice(0, 19) || '—'}
                    </td>
                    <td className="py-1.5 px-3 text-[9px] font-orbitron uppercase"
                      style={{ color: LEVEL_COLOR[String(m.level).toLowerCase()] ?? '#94a3b8' }}>
                      {m.level || '—'}
                    </td>
                    <td className="py-1.5 px-3 text-[10px] font-rajdhani text-slate-200">{m.rule_title}</td>
                    <td className="py-1.5 px-3 text-[10px] font-rajdhani text-slate-300">{m.hostname}</td>
                    <td className="py-1.5 px-3 text-[9px] font-mono-data text-slate-400">{m.unit || '—'}</td>
                    <td className="py-1.5 px-3 text-[10px] font-mono-data text-slate-300 break-words max-w-[460px]">
                      {m.message}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-[9px] font-mono-data text-slate-600 leading-relaxed">
        Evaluation happens in the backend against stored log events. A rule marked
        unsupported uses syntax this engine does not implement — it was not evaluated,
        not evaluated as empty. Supported subset: field matching with
        contains / startswith / endswith, and <span className="text-slate-400">selection</span> or{' '}
        <span className="text-slate-400">selection and not exclusion</span> conditions.
      </p>
    </div>
  );
};

export default SigmaDetection;
