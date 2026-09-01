import React, { useCallback, useState } from 'react';
import { API_BASE } from '../../utils/api';
import { usePolling } from '../../hooks/usePolling';

/**
 * AI Security Advisor.
 *
 * Two layers, deliberately kept visually and verbally separate, because
 * presenting inference as telemetry is the one thing this panel must never do:
 *
 *   OBSERVED FACTS  deterministic, derived only from collected telemetry.
 *                   Always available, always true.
 *   ADVISORY        model inference. Only present when ALLEYESX_AI_ENDPOINT is
 *                   configured, and labelled as inference.
 *
 * With no endpoint configured the facts still render and the advisory section
 * says plainly that inference is unavailable. It never substitutes a canned
 * opinion for a model.
 */

const AISecurityAdvisor: React.FC = () => {
  const [data, setData] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/analysis/ai`, { credentials: 'include' });
      if (res.ok) setData(await res.json());
    } catch { /* keep last known */ }
  }, []);

  usePolling(load, 60000);

  const facts: any[] = data?.observed_facts ?? [];

  if (!data) {
    return (
      <div className="rounded-lg border border-dashed border-slate-600/40 bg-slate-900/30 p-5 text-center">
        <p className="text-[10px] font-orbitron uppercase tracking-[0.18em] text-slate-500">
          Collecting telemetry…
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ---------- observed facts ---------- */}
      <div>
        <p className="text-[9px] font-orbitron uppercase tracking-[0.16em] text-slate-500 mb-2 flex items-center gap-2">
          Observed facts
          <span className="px-1.5 py-0.5 rounded border border-green-500/30 text-green-400 text-[8px]">
            real telemetry
          </span>
        </p>
        {facts.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-600/40 bg-slate-900/30 p-4 text-center">
            <p className="text-[10px] font-mono-data text-slate-600">
              No telemetry collected yet, so there are no facts to state.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto aeyes-scroll rounded-md border border-white/5">
            <table className="w-full text-left">
              <tbody>
                {facts.map((f, i) => (
                  <tr key={`${f.label}-${i}`} className="border-b border-white/5 last:border-0">
                    <td className="py-1.5 px-3 text-[10px] font-orbitron uppercase tracking-[0.12em] text-slate-500 whitespace-nowrap align-top">
                      {f.label}
                    </td>
                    <td className="py-1.5 px-3 text-[11px] font-mono-data text-slate-200">{f.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---------- advisory (inference) ---------- */}
      <div>
        <p className="text-[9px] font-orbitron uppercase tracking-[0.16em] text-slate-500 mb-2 flex items-center gap-2">
          Advisory
          <span className={`px-1.5 py-0.5 rounded border text-[8px] ${
            data.configured
              ? 'border-amber-500/30 text-amber-400'
              : 'border-slate-600/40 text-slate-500'
          }`}>
            {data.configured ? 'model inference' : 'not configured'}
          </span>
        </p>

        {data.configured ? (
          data.advice ? (
            <div className="rounded-md border border-amber-500/20 bg-amber-500/[0.04] p-4">
              <p className="text-[9px] font-orbitron uppercase tracking-[0.16em] text-amber-400/80 mb-2">
                Model inference — not telemetry
              </p>
              <pre className="text-[11px] font-mono-data text-slate-300 whitespace-pre-wrap leading-relaxed">
                {data.advice}
              </pre>
            </div>
          ) : (
            <div className="rounded-md border border-amber-500/20 bg-amber-500/[0.04] p-4">
              <p className="text-[10px] font-mono-data text-amber-200/80 leading-relaxed">
                An AI endpoint is configured but returned no usable response
                {data.error ? `: ${data.error}` : ''}. No advice is fabricated in its place.
              </p>
            </div>
          )
        ) : (
          <div className="rounded-md border border-dashed border-slate-600/40 bg-slate-900/30 p-4">
            <p className="text-[10px] font-mono-data text-slate-500 leading-relaxed">
              No AI endpoint is configured, so no inference is produced. The observed facts
              above are derived directly from collected telemetry and are always available.
            </p>
            <p className="mt-2 text-[10px] font-mono-data text-slate-600 leading-relaxed">
              Set <span className="text-slate-400">ALLEYESX_AI_ENDPOINT</span> (and optionally{' '}
              <span className="text-slate-400">ALLEYESX_AI_MODEL</span> and{' '}
              <span className="text-slate-400">ALLEYESX_AI_TOKEN</span>) on the server to enable
              inference. It will be labelled as inference and never presented as telemetry.
            </p>
          </div>
        )}
      </div>

      <p className="text-[9px] font-mono-data text-slate-600">{data.note}</p>
    </div>
  );
};

export default AISecurityAdvisor;
