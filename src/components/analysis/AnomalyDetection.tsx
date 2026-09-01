import React, { useCallback, useState } from 'react';
import { API_BASE } from '../../utils/api';
import { usePolling } from '../../hooks/usePolling';

/**
 * Anomaly detection.
 *
 * Statistics over each device's own stored telemetry history - not a model.
 * A device with too few samples reports BUILDING BASELINE rather than inventing
 * a deviation, because a "deviation" computed from too little history is a guess.
 *
 * Every finding names the metric, the baseline mean, the standard deviation, the
 * observed value and how many standard deviations away it sits, so a detection
 * can be checked rather than taken on faith.
 */

const AnomalyDetection: React.FC = () => {
  const [data, setData] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/analysis/anomalies`, { credentials: 'include' });
      if (res.ok) setData(await res.json());
    } catch { /* keep last known */ }
  }, []);

  usePolling(load, 60000);

  const devices: any[] = data?.devices ?? [];

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
      <p className="text-[10px] font-mono-data text-slate-500">
        {data.total} device(s) · {data.with_anomalies} with anomalies ·{' '}
        {data.building_baseline} building baseline · minimum {data.min_samples} samples
      </p>

      {devices.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-600/40 bg-slate-900/30 p-5 text-center">
          <p className="text-[10px] font-mono-data text-slate-600">
            No devices registered, so there is no history to baseline against.
          </p>
        </div>
      )}

      {devices.map(d => (
        <div key={d.device_id} className="rounded-md border border-white/5 bg-slate-900/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <p className="text-[11px] font-rajdhani text-slate-200">{d.hostname}</p>
            {d.status === 'building_baseline' ? (
              <span className="px-2 py-0.5 rounded border border-amber-500/30 text-amber-400 text-[8px] font-orbitron uppercase tracking-[0.14em]">
                Building baseline
              </span>
            ) : d.anomalies.length ? (
              <span className="px-2 py-0.5 rounded border border-red-500/30 text-red-300 text-[8px] font-orbitron uppercase tracking-[0.14em]">
                {d.anomalies.length} anomal{d.anomalies.length === 1 ? 'y' : 'ies'}
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded border border-green-500/30 text-green-400 text-[8px] font-orbitron uppercase tracking-[0.14em]">
                Normal
              </span>
            )}
          </div>

          {d.status === 'building_baseline' ? (
            <p className="text-[10px] font-mono-data text-slate-500 leading-relaxed">
              {d.note}
            </p>
          ) : (
            <>
              <div className="overflow-x-auto aeyes-scroll rounded-md border border-white/5">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-white/5">
                      {['Metric', 'Baseline', 'Std dev', 'Current', 'Sigma', 'State'].map(h => (
                        <th key={h} className="py-2 px-3 text-[8px] font-orbitron uppercase tracking-[0.16em] text-slate-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {d.metrics.map((m: any) => (
                      <tr key={m.metric} className="border-b border-white/5 last:border-0">
                        <td className="py-1.5 px-3 text-[10px] font-rajdhani text-slate-200">{m.metric}</td>
                        <td className="py-1.5 px-3 text-[10px] font-mono-data text-slate-400">{m.baseline_mean}</td>
                        <td className="py-1.5 px-3 text-[10px] font-mono-data text-slate-500">{m.baseline_stddev}</td>
                        <td className="py-1.5 px-3 text-[10px] font-mono-data text-slate-200">{m.current}</td>
                        <td className="py-1.5 px-3 text-[10px] font-mono-data text-slate-300">{m.sigma}σ</td>
                        <td className="py-1.5 px-3">
                          {m.anomalous ? (
                            <span className="text-[9px] font-orbitron uppercase text-red-300">anomaly</span>
                          ) : m.baseline_stddev === 0 ? (
                            <span className="text-[9px] font-orbitron uppercase text-slate-600" title="No variance in the baseline, so no deviation can be measured">
                              no variance
                            </span>
                          ) : (
                            <span className="text-[9px] font-orbitron uppercase text-green-400">normal</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[9px] font-mono-data text-slate-600">{d.note}</p>
            </>
          )}
        </div>
      ))}

      <p className="text-[9px] font-mono-data text-slate-600">{data.note}</p>
    </div>
  );
};

export default AnomalyDetection;
