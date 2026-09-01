import React, { useCallback, useMemo, useState } from 'react';
import { API_BASE } from '../../utils/api';
import { usePolling } from '../../hooks/usePolling';
import { findModule } from './capabilities';
import SensorRequired from './SensorRequired';

/**
 * Real-data panels for the two sensors that now exist.
 *
 * ConnectionAnalysis shows the kernel connection table the agent reports. It is
 * labelled as connections, not packets, everywhere - per-packet detail needs a
 * real capture sensor, and the rows carry a `source` field so the moment one is
 * installed the UI can say so instead of overclaiming.
 *
 * NodeLinks shows ARP neighbours and gateways. Links are drawn only between
 * monitored devices; unmanaged hosts are listed but deliberately not connected,
 * because an inferred link is worse than no link.
 */

const protoColor = (p: string) => (p === 'tcp' ? '#00d4ff' : '#eab308');

const stateColor = (s: string) => {
  const u = String(s || '').toUpperCase();
  if (u.startsWith('ESTABLISHED')) return '#22c55e';
  if (u === 'LISTEN') return '#38bdf8';
  if (u.startsWith('TIME_WAIT') || u.startsWith('CLOSE')) return '#64748b';
  return '#eab308';
};

const isPrivate = (ip: string) =>
  !ip || ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('172.16.')
  || ip.startsWith('127.') || ip === '0.0.0.0' || ip.startsWith('169.254.');

/* ------------------------------------------------------------------ */
/* CONNECTION ANALYSIS                                                 */
/* ------------------------------------------------------------------ */
export const ConnectionAnalysis: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'established' | 'listening' | 'external'>('all');
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/analysis/flows`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'fetch failed');
    }
  }, []);

  usePolling(load, 15000);

  const rows = useMemo(() => {
    let list: any[] = data?.connections ?? [];
    if (filter === 'established') list = list.filter(r => String(r.state).toUpperCase().startsWith('ESTABLISHED'));
    if (filter === 'listening') list = list.filter(r => String(r.state).toUpperCase() === 'LISTEN');
    if (filter === 'external') list = list.filter(r => !isPrivate(r.remote_ip));
    const needle = q.trim().toLowerCase();
    if (needle) {
      list = list.filter(r =>
        String(r.hostname).toLowerCase().includes(needle)
        || String(r.remote_ip).includes(needle)
        || String(r.local_port).includes(needle)
        || String(r.remote_port).includes(needle));
    }
    return list;
  }, [data, filter, q]);

  if (error) {
    return <SensorRequired module={{ ...findModule('packets')!, missing: `Analysis engine unavailable: ${error}` }} compact />;
  }

  if (!data?.total) {
    return (
      <div className="rounded-lg border border-dashed border-slate-600/40 bg-slate-900/30 p-5 text-center">
        <p className="text-[10px] font-orbitron uppercase tracking-[0.18em] text-slate-500">
          No connection data yet
        </p>
        <p className="mt-2 text-[10px] font-mono-data text-slate-600">
          The agent reports its connection table every 15 seconds once it is online.
        </p>
      </div>
    );
  }

  const stats = [
    { label: 'Connections', value: data.total, tone: 'text-slate-100' },
    { label: 'Established', value: data.established, tone: 'text-green-400' },
    { label: 'Listening', value: data.listening, tone: 'text-cyan-300' },
    { label: 'External', value: data.external, tone: data.external ? 'text-amber-300' : 'text-slate-400' },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {stats.map(s => (
          <div key={s.label} className="aeyes-stat rounded-md border border-white/5 bg-slate-900/30 px-3 py-2">
            <p className="text-[8px] font-orbitron uppercase tracking-[0.16em] text-slate-500">{s.label}</p>
            <p className={`aeyes-stat__value text-lg font-mono-data ${s.tone}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(['all', 'established', 'listening', 'external'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-2.5 py-1 rounded-md border text-[9px] font-orbitron uppercase tracking-[0.14em] transition-all ${
              filter === f ? 'border-green-500/40 bg-green-500/10 text-green-300'
                           : 'border-white/10 text-slate-500 hover:text-slate-300'}`}>
            {f}
          </button>
        ))}
        <input
          value={q} onChange={e => setQ(e.target.value)}
          placeholder="Filter host, IP or port..."
          className="flex-1 min-w-[150px] px-3 py-1.5 bg-slate-900/60 border border-white/10 rounded text-[11px] font-mono-data text-slate-200 placeholder-slate-600 focus:outline-none focus:border-green-500/40"
        />
      </div>

      <div className="overflow-x-auto aeyes-scroll rounded-md border border-white/5 max-h-[320px] overflow-y-auto">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-slate-900/95">
            <tr className="border-b border-white/5">
              {['Device', 'Proto', 'Local', 'Remote', 'State', 'Source'].map(h => (
                <th key={h} className="py-2 px-3 text-[8px] font-orbitron uppercase tracking-[0.16em] text-slate-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 300).map((r, i) => (
              <tr key={`${r.device_id}-${r.protocol}-${r.local_port}-${r.remote_ip}-${r.remote_port}-${i}`}
                className="border-b border-white/5">
                <td className="py-1.5 px-3 text-[11px] font-rajdhani text-slate-200">{r.hostname}</td>
                <td className="py-1.5 px-3 text-[10px] font-mono-data uppercase" style={{ color: protoColor(r.protocol) }}>
                  {r.protocol}
                </td>
                <td className="py-1.5 px-3 text-[10px] font-mono-data text-slate-300">{r.local_ip}:{r.local_port}</td>
                <td className="py-1.5 px-3 text-[10px] font-mono-data text-slate-400">
                  {r.remote_ip}{r.remote_port ? `:${r.remote_port}` : ''}
                  {!isPrivate(r.remote_ip) && <span className="ml-1 text-amber-300">ext</span>}
                </td>
                <td className="py-1.5 px-3 text-[9px] font-orbitron uppercase" style={{ color: stateColor(r.state) }}>
                  {r.state || '—'}
                </td>
                <td className="py-1.5 px-3 text-[9px] font-mono-data text-slate-600">{r.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[9px] font-mono-data text-slate-600 leading-relaxed">
        <span className="text-amber-200/70 font-orbitron uppercase tracking-wider">
          {data.is_packet_capture ? 'Packet capture active. ' : 'Connection table, not packet capture. '}
        </span>
        {data.note}
      </p>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* NODE-TO-NODE LINKS                                                  */
/* ------------------------------------------------------------------ */
export const NodeLinks: React.FC = () => {
  const [data, setData] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/analysis/links`, { credentials: 'include' });
      if (res.ok) setData(await res.json());
    } catch { /* keep last known */ }
  }, []);

  usePolling(load, 60000);

  if (!data?.has_data) {
    return (
      <div className="rounded-lg border border-dashed border-slate-600/40 bg-slate-900/30 p-5 text-center">
        <p className="text-[10px] font-orbitron uppercase tracking-[0.18em] text-slate-500">
          No link data yet
        </p>
        <p className="mt-2 text-[10px] font-mono-data text-slate-600">
          The agent reports ARP neighbours and its gateway every 60 seconds once it is online.
        </p>
      </div>
    );
  }

  const links: any[] = data.device_to_device ?? [];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {[
          { label: 'Neighbours', value: data.total },
          { label: 'Devices reporting', value: data.devices_reporting },
          { label: 'Gateways', value: (data.gateways ?? []).length },
        ].map(s => (
          <div key={s.label} className="aeyes-stat rounded-md border border-white/5 bg-slate-900/30 px-3 py-2">
            <p className="text-[8px] font-orbitron uppercase tracking-[0.16em] text-slate-500">{s.label}</p>
            <p className="aeyes-stat__value text-lg font-mono-data text-slate-100">{s.value}</p>
          </div>
        ))}
      </div>

      {links.length > 0 ? (
        <div className="overflow-x-auto aeyes-scroll rounded-md border border-white/5">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/5">
                {['From', 'To', 'MAC', 'Interface', 'State', 'Role'].map(h => (
                  <th key={h} className="py-2 px-3 text-[8px] font-orbitron uppercase tracking-[0.16em] text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {links.map((l, i) => (
                <tr key={`${l.from_device}-${l.to_ip}-${i}`} className="border-b border-white/5">
                  <td className="py-1.5 px-3 text-[11px] font-rajdhani text-slate-200">{l.from_host}</td>
                  <td className="py-1.5 px-3 text-[11px] font-rajdhani text-green-300">
                    {l.to_host} <span className="text-slate-500 font-mono-data text-[9px]">{l.to_ip}</span>
                  </td>
                  <td className="py-1.5 px-3 text-[9px] font-mono-data text-slate-400">{l.mac || '—'}</td>
                  <td className="py-1.5 px-3 text-[9px] font-mono-data text-slate-400">{l.interface || '—'}</td>
                  <td className="py-1.5 px-3 text-[9px] font-orbitron uppercase text-slate-400">{l.state || '—'}</td>
                  <td className="py-1.5 px-3 text-[9px] font-orbitron uppercase text-cyan-300">
                    {l.is_gateway ? 'gateway' : 'peer'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-[10px] font-mono-data text-slate-500 leading-relaxed">
          Neighbours are being reported, but none of them are monitored devices, so no
          node-to-node link can be drawn. A link is only drawn when both ends run an agent -
          an inferred link would be a guess.
        </p>
      )}

      <div className="overflow-x-auto aeyes-scroll rounded-md border border-white/5 max-h-[240px] overflow-y-auto">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-slate-900/95">
            <tr className="border-b border-white/5">
              {['Device', 'Neighbour', 'MAC', 'Interface', 'State', 'Gateway'].map(h => (
                <th key={h} className="py-2 px-3 text-[8px] font-orbitron uppercase tracking-[0.16em] text-slate-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(data.links ?? []).slice(0, 200).map((r: any, i: number) => (
              <tr key={`${r.device_id}-${r.neighbour_ip}-${i}`} className="border-b border-white/5">
                <td className="py-1.5 px-3 text-[11px] font-rajdhani text-slate-200">{r.hostname}</td>
                <td className="py-1.5 px-3 text-[10px] font-mono-data text-slate-300">{r.neighbour_ip}</td>
                <td className="py-1.5 px-3 text-[9px] font-mono-data text-slate-400">{r.neighbour_mac || '—'}</td>
                <td className="py-1.5 px-3 text-[9px] font-mono-data text-slate-400">{r.interface || '—'}</td>
                <td className="py-1.5 px-3 text-[9px] font-orbitron uppercase text-slate-400">{r.state || '—'}</td>
                <td className="py-1.5 px-3 text-[9px] font-orbitron uppercase text-cyan-300">
                  {r.is_gateway ? 'yes' : '—'}
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
