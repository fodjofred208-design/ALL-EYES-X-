import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import DeviceIcon from '../DeviceIcon';
import RadialGauge from '../effects/RadialGauge';
import { API_BASE } from '../../utils/api';
import { usePolling } from '../../hooks/usePolling';

/**
 * Per-device deep dive: one device at a time, with every chart the system can
 * actually draw for it.
 *
 * Two kinds of data are kept visibly separate:
 *   CURRENT  - the latest telemetry row (a live reading, not a trend)
 *   HISTORY  - traffic_samples, the only per-device time series that is stored
 * A field the agent never reported renders "NOT REPORTED" - never 0, because a
 * flat line at zero reads as a real measurement of nothing happening.
 */

interface Metrics {
  device: any;
  current: any;
  traffic_history: Array<{ ts: number; download: number; upload: number }>;
  alerts_by_severity: Array<{ severity: string; c: number }>;
  risk: { risk_score: number; risk_level: string; reasons: any[] };
  has_telemetry: boolean;
  has_traffic_history: boolean;
}

const RISK_COLOR: Record<string, string> = {
  LOW: '#22c55e', MEDIUM: '#eab308', HIGH: '#f97316', CRITICAL: '#ef4444',
};

const NotReported: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex flex-col items-center justify-center h-[130px]">
    <p className="text-[9px] font-orbitron uppercase tracking-[0.18em] text-slate-600">{label}</p>
    <p className="mt-1 text-[9px] font-mono-data text-slate-700">NOT REPORTED</p>
  </div>
);

const fmtDuration = (secs: number | null | undefined): string => {
  if (secs == null || secs < 0) return 'unknown';
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

const fmtBytes = (n: number | null | undefined): string => {
  if (n == null) return 'n/a';
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / Math.pow(1024, i)).toFixed(1)} ${u[i]}`;
};

const InfoCell: React.FC<{ label: string; value?: React.ReactNode; mono?: boolean }> = ({ label, value, mono }) => (
  <div className="min-w-0">
    <p className="text-[8px] font-orbitron uppercase tracking-[0.16em] text-slate-500">{label}</p>
    <p className={`text-[11px] truncate ${mono ? 'font-mono-data' : 'font-rajdhani'} ${
      value == null || value === '' ? 'text-slate-700' : 'text-slate-200'}`}>
      {value == null || value === '' ? 'not reported' : value}
    </p>
  </div>
);

const DeviceDeepDive: React.FC<{ devices: Array<{ id: string; hostname: string; status: string }> }> = ({ devices }) => {
  const [deviceId, setDeviceId] = useState<string>('');
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Default to the first online device so a connected machine is shown
  // immediately rather than an empty panel.
  useEffect(() => {
    if (deviceId || !devices.length) return;
    const online = devices.find(d => d.status === 'online');
    setDeviceId((online ?? devices[0]).id);
  }, [devices, deviceId]);

  const load = useCallback(async () => {
    if (!deviceId) return;
    try {
      const res = await fetch(`${API_BASE}/api/analysis/device/${encodeURIComponent(deviceId)}/metrics`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setMetrics(await res.json());
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'fetch failed');
    }
  }, [deviceId]);

  usePolling(load, 8000);

  const traffic = useMemo(
    () => (metrics?.traffic_history ?? []).map(t => ({
      name: new Date(t.ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      down: +(t.download / 1024).toFixed(2),
      up: +(t.upload / 1024).toFixed(2),
    })),
    [metrics],
  );

  if (!devices.length) {
    return (
      <div className="rounded-lg border border-dashed border-slate-600/40 bg-slate-900/30 p-6 text-center">
        <p className="text-[10px] font-orbitron uppercase tracking-[0.18em] text-slate-500">No devices registered</p>
        <p className="mt-2 text-[10px] font-mono-data text-slate-600">
          Per-device charts appear once an agent registers.
        </p>
      </div>
    );
  }

  const d = metrics?.device;
  const cur = metrics?.current;
  const risk = metrics?.risk;
  const online = d?.status === 'online';

  const gauges: Array<{ label: string; value: number | null; color: string }> = [
    { label: 'CPU', value: cur?.cpu ?? null, color: '#00d4ff' },
    { label: 'RAM', value: cur?.ram ?? null, color: '#8b5cf6' },
    { label: 'DISK', value: cur?.disk ?? null, color: '#eab308' },
    { label: 'BATTERY', value: cur?.battery ?? null, color: '#22c55e' },
  ];

  return (
    <div className="space-y-4">
      {/* ---- device selector ---- */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[9px] font-orbitron uppercase tracking-[0.16em] text-slate-500">
          Device
          <select
            value={deviceId}
            onChange={e => setDeviceId(e.target.value)}
            className="bg-slate-900/60 border border-white/10 rounded px-2 py-1.5 text-[11px] font-mono-data text-slate-200 normal-case tracking-normal min-w-[180px]"
          >
            {devices.map(dev => (
              <option key={dev.id} value={dev.id}>
                {dev.hostname} — {dev.status}
              </option>
            ))}
          </select>
        </label>
        {d && (
          <span className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-md border text-[8px] font-orbitron uppercase tracking-[0.16em] ${
            online ? 'border-green-500/30 text-green-400 bg-green-500/[0.07]'
                   : 'border-slate-600/40 text-slate-500 bg-slate-800/40'}`}>
            <motion.span
              className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-green-400' : 'bg-slate-500'}`}
              animate={online ? { opacity: [1, 0.3, 1] } : { opacity: 1 }}
              transition={{ duration: 2, repeat: Infinity }} />
            {online ? 'Live' : 'Offline'}
          </span>
        )}
        {error && (
          <span className="text-[9px] font-orbitron uppercase tracking-[0.16em] text-red-400">
            Analysis engine unavailable
          </span>
        )}
      </div>

      {d && (
        <>
          {/* ---- identity strip: OS icon + basic facts ---- */}
          <div className="rounded-lg border border-white/5 bg-slate-900/30 p-4 flex flex-wrap items-center gap-5">
            <div className="flex items-center gap-3 shrink-0">
              <div className={online ? 'text-green-400' : 'text-slate-600'}>
                <DeviceIcon hostname={d.hostname} os={d.os_name} size={44} online={online} />
              </div>
              <div>
                <p className="text-sm font-rajdhani text-white">{d.hostname}</p>
                <p className="text-[10px] font-mono-data text-slate-400">{d.os_name || 'OS not reported'}</p>
                {d.is_vm && (
                  <p className="text-[9px] font-orbitron uppercase tracking-[0.14em] text-cyan-300/80 mt-0.5">
                    VM · {d.hypervisor || 'hypervisor unknown'}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-3 flex-1 min-w-[240px]">
              <InfoCell label="IP" value={d.ip} mono />
              <InfoCell label="MAC" value={d.mac} mono />
              <InfoCell label="Architecture" value={d.architecture} />
              <InfoCell label="Known for" value={fmtDuration(d.online_seconds)} mono />
              <InfoCell label="Last seen" value={d.last_seen ? String(d.last_seen).replace('T', ' ').slice(0, 19) : null} mono />
              <InfoCell label="Logged user" value={cur?.logged_user} />
            </div>
          </div>

          {/* ---- live gauges ---- */}
          <div>
            <p className="text-[9px] font-orbitron uppercase tracking-[0.18em] text-slate-500 mb-2">
              Current state · {cur?.updated_at ? `updated ${String(cur.updated_at).replace('T', ' ').slice(0, 19)}` : 'no telemetry yet'}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {gauges.map(g => (
                <div key={g.label} className="rounded-lg border border-white/5 bg-slate-900/30 p-3 flex flex-col items-center">
                  {g.value == null ? (
                    <NotReported label={g.label} />
                  ) : (
                    <>
                      <RadialGauge value={g.value} size={96} stroke={7} color={g.color} label={g.label}
                        sublabel={`${Math.round(g.value)}%`} />
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ---- traffic history: the only real per-device time series ---- */}
          <div>
            <p className="text-[9px] font-orbitron uppercase tracking-[0.18em] text-slate-500 mb-2">
              Traffic history · {traffic.length} sample(s)
            </p>
            <div className="rounded-lg border border-white/5 bg-slate-900/30 p-3">
              {metrics?.has_traffic_history ? (
                <div className="h-[190px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={traffic}>
                      <defs>
                        <linearGradient id="ddDown" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#00d4ff" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#00d4ff" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="ddUp" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                      <XAxis dataKey="name" stroke="#ffffff10" fontSize={8} axisLine={false} tickLine={false} minTickGap={24} />
                      <YAxis stroke="#ffffff10" fontSize={8} axisLine={false} tickLine={false} width={38} />
                      <Tooltip contentStyle={{ backgroundColor: '#0a0e1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 10 }} />
                      <Area type="monotone" dataKey="down" name="Down KB" stroke="#00d4ff" fill="url(#ddDown)" strokeWidth={1.5} />
                      <Area type="monotone" dataKey="up" name="Up KB" stroke="#22c55e" fill="url(#ddUp)" strokeWidth={1.5} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[120px] flex flex-col items-center justify-center">
                  <p className="text-[9px] font-orbitron uppercase tracking-[0.18em] text-slate-600">Traffic</p>
                  <p className="mt-1 text-[9px] font-mono-data text-slate-700">NO TRAFFIC SAMPLES YET</p>
                </div>
              )}
            </div>
          </div>

          {/* ---- risk + exposure ---- */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-lg border border-white/5 bg-slate-900/30 p-4">
              <p className="text-[9px] font-orbitron uppercase tracking-[0.18em] text-slate-500 mb-2">Threat / risk</p>
              {risk ? (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-mono-data" style={{ color: RISK_COLOR[risk.risk_level] ?? '#94a3b8' }}>
                      {risk.risk_score}
                    </span>
                    <span className="text-[10px] font-orbitron uppercase tracking-[0.16em]"
                      style={{ color: RISK_COLOR[risk.risk_level] ?? '#94a3b8' }}>{risk.risk_level}</span>
                  </div>
                  <ul className="mt-3 space-y-1.5">
                    {risk.reasons.length === 0 && (
                      <li className="text-[10px] font-mono-data text-slate-600">No risk factors observed</li>
                    )}
                    {risk.reasons.map((r: any, i: number) => (
                      <li key={i} className="text-[10px] font-mono-data text-slate-400" title={r.evidence}>
                        <span className="text-slate-600">+{r.weight}</span> {r.label}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-[10px] font-mono-data text-slate-600">Not calculated yet</p>
              )}
            </div>

            <div className="rounded-lg border border-white/5 bg-slate-900/30 p-4">
              <p className="text-[9px] font-orbitron uppercase tracking-[0.18em] text-slate-500 mb-2">Exposure &amp; controls</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <InfoCell label="Listening ports" value={cur?.open_ports?.length ? cur.open_ports.join(', ') : 'none reported'} mono />
                <InfoCell label="USB devices" value={cur?.usb_devices?.length ?? null} mono />
                <InfoCell label="Suspicious processes" value={cur?.suspicious_processes?.length ?? null} mono />
                <InfoCell label="Total sent" value={fmtBytes(cur?.net_sent)} mono />
                <InfoCell label="Total received" value={fmtBytes(cur?.net_recv)} mono />
                <InfoCell label="GPU" value={cur?.gpu} />
                <InfoCell label="Firewall" value={
                  cur?.firewall === 1 ? 'Enabled' : cur?.firewall === 0 ? 'Disabled' : null} />
                <InfoCell label="Antivirus" value={
                  cur?.antivirus === 1 ? 'Active' : cur?.antivirus === 0 ? 'Inactive' : null} />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default DeviceDeepDive;
