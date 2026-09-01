import React, { useCallback, useState } from 'react';
import { API_BASE } from '../../utils/api';
import { usePolling } from '../../hooks/usePolling';

/**
 * Threat geography.
 *
 * Origins are external destinations the agents actually connected to, taken from
 * the connection table. Private ranges are excluded.
 *
 * The map arcs are drawn ONLY when a geolocation source supplies real
 * coordinates. There is no geolocation service configured, so by default this
 * shows the tabular origin list and says plainly that the map needs a geo source.
 * Inventing a latitude for an IP would be worse than showing none.
 */

const ThreatHeatMap: React.FC = () => {
  const [data, setData] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/analysis/threats`, { credentials: 'include' });
      if (res.ok) setData(await res.json());
    } catch { /* keep last known */ }
  }, []);

  usePolling(load, 60000);

  const origins: any[] = data?.origins ?? [];
  const geoAvailable = Boolean(data?.geo_available);
  const located = origins.filter(o => o.latitude != null && o.longitude != null);

  if (!data?.has_data) {
    return (
      <div className="rounded-lg border border-dashed border-slate-600/40 bg-slate-900/30 p-5 text-center">
        <p className="text-[10px] font-orbitron uppercase tracking-[0.18em] text-slate-500">
          No active threat geography
        </p>
        <p className="mt-2 text-[10px] font-mono-data text-slate-600 leading-relaxed">
          No external destinations have been observed. Once an agent reports connections
          to addresses outside private ranges they appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Map layer - only when real coordinates exist */}
      {geoAvailable && located.length > 0 ? (
        <div className="relative rounded-md border border-white/5 bg-slate-950/60 overflow-hidden" style={{ height: 260 }}>
          <svg viewBox="0 0 100 50" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
            {/* equirectangular projection: lon -180..180 -> 0..100, lat 90..-90 -> 0..50 */}
            {located.map((o, i) => {
              const x = ((Number(o.longitude) + 180) / 360) * 100;
              const y = ((90 - Number(o.latitude)) / 180) * 50;
              const r = Math.min(2.4, 0.6 + Math.log2(1 + o.connections) * 0.35);
              return (
                <g key={`${o.remote_ip}-${i}`}>
                  <circle cx={x} cy={y} r={r} fill="#ef4444" opacity={0.75} />
                  <circle cx={x} cy={y} r={r * 2.2} fill="none" stroke="#ef4444" strokeWidth={0.25} opacity={0.35}>
                    <animate attributeName="r" values={`${r};${r * 2.6};${r}`} dur="3s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.4;0;0.4" dur="3s" repeatCount="indefinite" />
                  </circle>
                </g>
              );
            })}
          </svg>
          <p className="absolute bottom-2 left-3 text-[8px] font-orbitron uppercase tracking-[0.16em] text-slate-500">
            {located.length} located origin(s) · dot size scales with connection count
          </p>
        </div>
      ) : (
        <div className="rounded-md border border-amber-500/20 bg-amber-500/[0.05] px-3 py-3">
          <p className="text-[9px] font-orbitron uppercase tracking-[0.18em] text-amber-400/90">
            Map unavailable — no geolocation source
          </p>
          <p className="mt-1.5 text-[10px] font-mono-data text-slate-400 leading-relaxed">
            External destinations are listed below with real connection counts, but no
            geolocation service is configured, so no coordinates are emitted and no arcs
            are drawn. An invented latitude would be worse than none.
          </p>
        </div>
      )}

      {/* Origin table - always real */}
      <div className="overflow-x-auto aeyes-scroll rounded-md border border-white/5 max-h-[300px] overflow-y-auto">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-slate-900/95">
            <tr className="border-b border-white/5">
              {['Origin IP', 'Connections', 'Ports', 'Seen on', 'Location'].map(h => (
                <th key={h} className="py-2 px-3 text-[8px] font-orbitron uppercase tracking-[0.16em] text-slate-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {origins.map((o, i) => (
              <tr key={`${o.remote_ip}-${i}`} className="border-b border-white/5 align-top">
                <td className="py-1.5 px-3 text-[11px] font-mono-data text-red-300">{o.remote_ip}</td>
                <td className="py-1.5 px-3 text-[10px] font-mono-data text-slate-200">{o.connections}</td>
                <td className="py-1.5 px-3 text-[10px] font-mono-data text-slate-400">
                  {o.ports?.length ? o.ports.join(', ') : '—'}
                </td>
                <td className="py-1.5 px-3 text-[10px] font-rajdhani text-slate-300">
                  {o.devices?.length ? o.devices.join(', ') : '—'}
                </td>
                <td className="py-1.5 px-3 text-[10px] font-mono-data text-slate-400">
                  {o.country || o.city
                    ? [o.city, o.country].filter(Boolean).join(', ')
                    : <span className="text-slate-600">not located</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[9px] font-mono-data text-slate-600">{data.note}</p>
    </div>
  );
};

export default ThreatHeatMap;
