import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import { findModule } from './capabilities';
import SensorRequired from './SensorRequired';

/**
 * Analysis module renderers.
 *
 * Every module here reads real API data. A module whose sensor does not exist
 * renders <SensorRequired/> instead of a chart - see capabilities.ts, which is
 * the single source of truth for what the system can actually provide.
 *
 * Kept in one file on purpose: the goal is a coherent workspace, not twenty-five
 * near-empty components.
 */

const LEVEL_COLOR: Record<string, string> = {
  LOW: '#22c55e', MEDIUM: '#eab308', HIGH: '#f97316', CRITICAL: '#ef4444',
};

export const Th: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <th className={`py-2 pr-3 text-left text-[8px] font-orbitron uppercase tracking-[0.16em] text-slate-500 ${className}`}>
    {children}
  </th>
);

export const EmptyRow: React.FC<{ cols: number; message: string }> = ({ cols, message }) => (
  <tr>
    <td colSpan={cols} className="py-6 text-center text-[10px] font-mono-data text-slate-600">
      {message}
    </td>
  </tr>
);

const TableShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="overflow-x-auto aeyes-scroll rounded-md border border-white/5">
    <table className="w-full text-left">{children}</table>
  </div>
);

const bytes = (n: number): string => {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
};

/* ------------------------------------------------------------------ */
/* 01 - DEVICE RISK RANKING                                            */
/* ------------------------------------------------------------------ */
export const RiskRankingModule: React.FC<{ devices: any[] }> = ({ devices }) => {
  const navigate = useNavigate();
  const mod = findModule('risk')!;
  if (!devices.length) {
    return <SensorRequired module={mod} compact />;
  }
  return (
    <div className="space-y-3">
      <TableShell>
        <thead>
          <tr className="border-b border-white/5">
            <Th>Host</Th><Th>OS</Th><Th>Status</Th><Th>Risk</Th><Th>Level</Th><Th>Alerts</Th>
          </tr>
        </thead>
        <tbody>
          {devices.map(d => {
            const color = LEVEL_COLOR[d.risk_level] ?? '#64748b';
            const why = (d.reasons || [])
              .map((r: any) => `+${r.weight}  ${r.label}\n      evidence: ${r.evidence}`)
              .join('\n') || 'No risk factors observed';
            return (
              <tr
                key={d.device_id}
                onClick={() => navigate(`/device/${d.device_id}`)}
                title={`Risk ${d.risk_score} - ${d.risk_level}\n\n${why}`}
                className="border-b border-white/5 cursor-pointer hover:bg-white/5 transition-colors"
              >
                <td className="py-2 pr-3 text-[11px] font-rajdhani text-slate-200">{d.hostname}</td>
                <td className="py-2 pr-3 text-[10px] font-mono-data text-slate-400">{d.os_name}</td>
                <td className="py-2 pr-3">
                  <span className={`text-[9px] font-orbitron ${d.status === 'online' ? 'text-green-500' : 'text-slate-500'}`}>
                    {String(d.status).toUpperCase()}
                  </span>
                </td>
                <td className="py-2 pr-3">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full transition-all duration-700"
                        style={{ width: `${d.risk_score}%`, backgroundColor: color }} />
                    </div>
                    <span className="text-[10px] font-mono-data text-slate-300">{d.risk_score}</span>
                  </div>
                </td>
                <td className="py-2 pr-3">
                  <span className="px-2 py-0.5 rounded text-[9px] font-orbitron"
                    style={{ backgroundColor: `${color}22`, color }}>{d.risk_level}</span>
                </td>
                <td className="py-2 text-[10px] font-mono-data text-slate-400">{d.alert_count}</td>
              </tr>
            );
          })}
        </tbody>
      </TableShell>
      <p className="text-[9px] font-mono-data text-slate-600">
        Hover a row for the evidence behind its score. Click to open the device.
        Score 0-100, higher is worse - every point is traceable to reported telemetry.
      </p>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* 02 - OPEN PORTS + ATTACK SURFACE                                    */
/* ------------------------------------------------------------------ */
export const OpenPortsModule: React.FC<{ devices: any[] }> = ({ devices }) => {
  const mod = findModule('openports')!;
  const rows = useMemo(
    () => devices.flatMap(d => (d.open_ports || []).map((p: number) => ({
      device: d.hostname, device_id: d.device_id, port: p,
      risky: (d.high_risk_ports || []).some((h: any) => h.port === p),
      service: (d.high_risk_ports || []).find((h: any) => h.port === p)?.service,
    }))).sort((a, b) => Number(b.risky) - Number(a.risky) || a.port - b.port),
    [devices],
  );

  const withTelemetry = devices.filter(d => d.has_telemetry);
  if (!withTelemetry.length) {
    return <SensorRequired module={mod} compact />;
  }

  return (
    <div className="space-y-3">
      <TableShell>
        <thead>
          <tr className="border-b border-white/5">
            <Th>Port</Th><Th>Service</Th><Th>Device</Th><Th>Risk</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <EmptyRow cols={4} message="No listening ports reported" />}
          {rows.slice(0, 200).map((r, i) => (
            <tr key={`${r.device_id}-${r.port}-${i}`} className="border-b border-white/5">
              <td className="py-1.5 pr-3 text-[11px] font-mono-data text-slate-200">{r.port}</td>
              <td className="py-1.5 pr-3 text-[10px] font-mono-data text-slate-400">
                {r.service ?? <span className="text-slate-600">not in known-service map</span>}
              </td>
              <td className="py-1.5 pr-3 text-[10px] font-mono-data text-slate-400">{r.device}</td>
              <td className="py-1.5">
                {r.risky
                  ? <span className="px-2 py-0.5 rounded text-[9px] font-orbitron text-red-300 bg-red-500/10">HIGH</span>
                  : <span className="px-2 py-0.5 rounded text-[9px] font-orbitron text-slate-400 bg-white/5">NORMAL</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </TableShell>
      <p className="text-[9px] font-mono-data text-slate-600">
        Protocol (TCP/UDP) and per-port state are not collected by the agent, so those
        columns are omitted rather than guessed. {mod.missing}
      </p>
    </div>
  );
};

export const AttackSurfaceModule: React.FC<{ endpoints: any; }> = ({ endpoints }) => {
  const mod = findModule('surface')!;
  if (!endpoints?.devices_with_telemetry) {
    return <SensorRequired module={mod} compact />;
  }
  const stats = [
    { label: 'Devices reporting', value: endpoints.devices_with_telemetry },
    { label: 'Listening ports', value: endpoints.total_ports },
    { label: 'High-risk ports', value: endpoints.total_high_risk },
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        {stats.map(s => (
          <div key={s.label} className="rounded-md border border-white/5 bg-slate-900/30 px-3 py-2">
            <p className="text-[8px] font-orbitron uppercase tracking-[0.16em] text-slate-500">{s.label}</p>
            <p className="text-lg font-mono-data text-slate-100">{s.value}</p>
          </div>
        ))}
      </div>
      <div className="rounded-md border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2">
        <p className="text-[9px] font-mono-data text-amber-200/80 leading-relaxed">
          <span className="font-orbitron uppercase tracking-wider">Internet-facing exposure unknown. </span>
          {mod.missing}
        </p>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* 01B / 05A / 05C - ENDPOINT SECURITY (USB, processes, firewall)      */
/* ------------------------------------------------------------------ */
export const EndpointSecurityModule: React.FC<{ devices: any[] }> = ({ devices }) => {
  const rows = devices.filter(d => d.has_telemetry);
  if (!rows.length) {
    return <SensorRequired module={findModule('behavior')!} compact />;
  }
  return (
    <div className="space-y-3">
      <TableShell>
        <thead>
          <tr className="border-b border-white/5">
            <Th>Device</Th><Th>Firewall</Th><Th>Antivirus</Th><Th>Disk Enc.</Th>
            <Th>Suspicious Processes</Th><Th>USB Devices</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map(d => {
            const tri = (v: number) =>
              v === 1 ? ['ENABLED', 'text-green-400'] : v === 0 ? ['DISABLED', 'text-red-400'] : ['NOT REPORTED', 'text-slate-600'];
            const [fw, fwc] = tri(d.firewall);
            const [av, avc] = tri(d.antivirus);
            const [enc, encc] = tri(d.encrypted_disk);
            const susp = d.suspicious_processes || [];
            const usb = d.usb_devices || [];
            return (
              <tr key={d.device_id} className="border-b border-white/5">
                <td className="py-2 pr-3 text-[11px] font-rajdhani text-slate-200">
                  {d.hostname}
                  {d.malware_detected && (
                    <span className="ml-2 px-1.5 py-0.5 rounded text-[8px] font-orbitron text-red-300 bg-red-500/15">
                      MALWARE FLAG
                    </span>
                  )}
                </td>
                <td className={`py-2 pr-3 text-[9px] font-orbitron ${fwc}`}>{fw}</td>
                <td className={`py-2 pr-3 text-[9px] font-orbitron ${avc}`}>{av}</td>
                <td className={`py-2 pr-3 text-[9px] font-orbitron ${encc}`}>{enc}</td>
                <td className="py-2 pr-3 text-[10px] font-mono-data">
                  {susp.length
                    ? <span className="text-amber-300">{susp.map((x: any) => (x?.name ?? String(x))).join(', ')}</span>
                    : <span className="text-slate-600">none reported</span>}
                </td>
                <td className="py-2 text-[10px] font-mono-data">
                  {usb.length
                    ? <span className="text-slate-300">{usb.length} attached</span>
                    : <span className="text-slate-600">none reported</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </TableShell>
      <p className="text-[9px] font-mono-data text-slate-600 leading-relaxed">
        Suspicious processes are what the agent flagged, not a confirmed malware verdict -
        no parent process or timestamp is collected, so nothing is placed on a timeline.
        USB shows currently attached devices only; first-seen / last-seen history is not collected.
        Firewall state is a single boolean; rules and allow/block counts require more telemetry.
      </p>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* 03 - PROTOCOL STATISTICS + TOP TALKERS                              */
/* ------------------------------------------------------------------ */
export const ProtocolStatistics: React.FC<{ protocols: any[] }> = ({ protocols }) => {
  const mod = findModule('protocols')!;
  if (!protocols?.length) {
    return <SensorRequired module={mod} compact />;
  }
  const total = protocols.reduce((s, p) => s + (p.devices || 0), 0) || 1;
  return (
    <div className="space-y-3">
      <TableShell>
        <thead>
          <tr className="border-b border-white/5">
            <Th>Service</Th><Th>Share</Th><Th>Devices</Th><Th>Distribution</Th>
          </tr>
        </thead>
        <tbody>
          {protocols.map((p: any) => (
            <tr key={p.name} className="border-b border-white/5">
              <td className="py-1.5 pr-3 text-[11px] font-mono-data text-slate-200">{p.name}</td>
              <td className="py-1.5 pr-3 text-[10px] font-mono-data text-slate-400">{p.percent}%</td>
              <td className="py-1.5 pr-3 text-[10px] font-mono-data text-slate-400">{p.devices}</td>
              <td className="py-1.5">
                <div className="w-32 h-1 bg-white/5 rounded-full overflow-hidden">
                  <motion.div className="h-full bg-cyan-400"
                    initial={{ width: 0 }} animate={{ width: `${(p.devices / total) * 100}%` }}
                    transition={{ duration: 0.6 }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </TableShell>
      <p className="text-[9px] font-mono-data text-amber-200/70 leading-relaxed">
        <span className="font-orbitron uppercase tracking-wider">Listening service statistics, not traffic. </span>
        {mod.missing}
      </p>
    </div>
  );
};

export const TopTalkersModule: React.FC<{ talkers: any }> = ({ talkers }) => {
  const mod = findModule('talkers')!;
  if (!talkers?.has_data) {
    return (
      <div className="rounded-lg border border-dashed border-slate-600/40 bg-slate-900/30 p-4">
        <p className="text-[10px] font-orbitron uppercase tracking-[0.2em] text-slate-500">
          No traffic samples yet
        </p>
        <p className="mt-2 text-[10px] font-mono-data text-slate-500">
          Traffic totals appear once agents report network counters. Nothing is estimated.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <TableShell>
        <thead>
          <tr className="border-b border-white/5">
            <Th>#</Th><Th>Device</Th><Th>Download</Th><Th>Upload</Th><Th>Total</Th><Th>Samples</Th>
          </tr>
        </thead>
        <tbody>
          {talkers.talkers.map((t: any, i: number) => (
            <tr key={t.device_id} className="border-b border-white/5">
              <td className="py-1.5 pr-3 text-[10px] font-mono-data text-slate-500">{i + 1}</td>
              <td className="py-1.5 pr-3 text-[11px] font-rajdhani text-slate-200">{t.hostname}</td>
              <td className="py-1.5 pr-3 text-[10px] font-mono-data text-cyan-300">{bytes(t.download_bytes)}</td>
              <td className="py-1.5 pr-3 text-[10px] font-mono-data text-green-300">{bytes(t.upload_bytes)}</td>
              <td className="py-1.5 pr-3 text-[10px] font-mono-data text-slate-300">{bytes(t.total_bytes)}</td>
              <td className="py-1.5 text-[10px] font-mono-data text-slate-500">{t.samples}</td>
            </tr>
          ))}
        </tbody>
      </TableShell>
      <p className="text-[9px] font-mono-data text-slate-600">{mod.missing}</p>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* 06 - SESSION MONITORING                                             */
/* ------------------------------------------------------------------ */
export const SessionsModule: React.FC<{ sessions: any }> = ({ sessions }) => {
  const mod = findModule('sessions')!;
  const remote = sessions?.remote_control_sessions ?? [];
  const auth = sessions?.dashboard_auth_attempts ?? [];
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-cyan-500/20 bg-cyan-500/[0.05] px-3 py-2">
        <p className="text-[9px] font-mono-data text-cyan-200/80 leading-relaxed">{sessions?.note}</p>
      </div>

      <div>
        <p className="text-[9px] font-orbitron uppercase tracking-[0.18em] text-slate-400 mb-2">
          Administrator remote-control sessions ({remote.length})
        </p>
        <TableShell>
          <thead>
            <tr className="border-b border-white/5">
              <Th>Device</Th><Th>Started By</Th><Th>Started</Th><Th>Ended</Th><Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {remote.length === 0 && <EmptyRow cols={5} message="No remote-control sessions recorded" />}
            {remote.slice(0, 50).map((r: any) => (
              <tr key={r.session_id} className="border-b border-white/5">
                <td className="py-1.5 pr-3 text-[11px] font-rajdhani text-slate-200">{r.hostname}</td>
                <td className="py-1.5 pr-3 text-[10px] font-mono-data text-slate-400">{r.started_by}</td>
                <td className="py-1.5 pr-3 text-[10px] font-mono-data text-slate-400">{r.started_at}</td>
                <td className="py-1.5 pr-3 text-[10px] font-mono-data text-slate-400">{r.ended_at || '—'}</td>
                <td className="py-1.5">
                  <span className={`text-[9px] font-orbitron ${r.ended_at ? 'text-slate-500' : 'text-green-400'}`}>
                    {r.ended_at ? 'CLOSED' : 'ACTIVE'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      </div>

      <div>
        <p className="text-[9px] font-orbitron uppercase tracking-[0.18em] text-slate-400 mb-2">
          Dashboard authentication attempts ({auth.length})
        </p>
        <TableShell>
          <thead>
            <tr className="border-b border-white/5">
              <Th>User</Th><Th>Source IP</Th><Th>Time</Th><Th>Result</Th>
            </tr>
          </thead>
          <tbody>
            {auth.length === 0 && <EmptyRow cols={4} message="No authentication attempts recorded" />}
            {auth.slice(0, 50).map((a: any, i: number) => (
              <tr key={i} className="border-b border-white/5">
                <td className="py-1.5 pr-3 text-[11px] font-mono-data text-slate-200">{a.username}</td>
                <td className="py-1.5 pr-3 text-[10px] font-mono-data text-slate-400">{a.ip}</td>
                <td className="py-1.5 pr-3 text-[10px] font-mono-data text-slate-400">{a.timestamp}</td>
                <td className="py-1.5">
                  <span className={`text-[9px] font-orbitron ${a.success ? 'text-green-400' : 'text-red-400'}`}>
                    {a.success ? 'SUCCESS' : 'FAILED'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      </div>

      <p className="text-[9px] font-mono-data text-slate-600">{mod.missing}</p>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* 01 - FLEET COMPOSITION (the three real charts retired from the old  */
/*      Analytics page, kept because the data behind them is genuine)  */
/* ------------------------------------------------------------------ */
const CHART_COLORS = ['#22c55e', '#00d4ff', '#eab308', '#f97316', '#ef4444', '#8b5cf6', '#64748b'];

export const FleetCompositionModule: React.FC<{ analytics: any }> = ({ analytics }) => {
  const timeline = analytics?.timeline;
  const os = analytics?.os_chart;
  const country = analytics?.country_chart;

  const activity = useMemo(
    () => (timeline?.labels ?? []).map((l: string, i: number) => ({
      name: l, activity: timeline.values?.[i] ?? 0,
    })),
    [timeline],
  );
  const osRows = useMemo(
    () => (os?.labels ?? []).map((l: string, i: number) => ({
      name: l, value: os.values?.[i] ?? 0,
    })),
    [os],
  );
  const countryRows = useMemo(
    () => (country?.labels ?? []).map((l: string, i: number) => ({
      name: l, value: country.values?.[i] ?? 0,
    })),
    [country],
  );

  if (!activity.length && !osRows.length && !countryRows.length) {
    return (
      <div className="rounded-lg border border-dashed border-slate-600/40 bg-slate-900/30 p-4">
        <p className="text-[10px] font-mono-data text-slate-500">
          No device inventory reported yet - composition appears once agents register.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="rounded-md border border-white/5 bg-slate-900/30 p-3">
        <p className="text-[9px] font-orbitron uppercase tracking-[0.16em] text-slate-500 mb-2">
          Activity - Last 24 Hours
        </p>
        <div className="h-[150px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={activity.length ? activity : [{ name: '--', activity: 0 }]}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
              <XAxis dataKey="name" stroke="#ffffff10" fontSize={8} axisLine={false} tickLine={false} />
              <YAxis stroke="#ffffff10" fontSize={8} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ backgroundColor: '#0a0e1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 10 }} />
              <Line type="monotone" dataKey="activity" stroke="#22c55e" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-md border border-white/5 bg-slate-900/30 p-3">
        <p className="text-[9px] font-orbitron uppercase tracking-[0.16em] text-slate-500 mb-2">
          OS Distribution
        </p>
        <div className="h-[150px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={osRows.length ? osRows : [{ name: 'No Data', value: 0 }]}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
              <XAxis dataKey="name" stroke="#ffffff10" fontSize={8} axisLine={false} tickLine={false} />
              <YAxis stroke="#ffffff10" fontSize={8} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: '#ffffff05' }} contentStyle={{ backgroundColor: '#0a0e1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 10 }} />
              <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                {osRows.map((_: any, i: number) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-md border border-white/5 bg-slate-900/30 p-3">
        <p className="text-[9px] font-orbitron uppercase tracking-[0.16em] text-slate-500 mb-2">
          Devices by Country
        </p>
        <div className="h-[150px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={countryRows.length ? countryRows : [{ name: 'Unknown', value: 1 }]}
                cx="50%" cy="50%" innerRadius={32} outerRadius={52} paddingAngle={3} dataKey="value">
                {countryRows.map((_: any, i: number) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: '#0a0e1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 10 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-1 text-[8px] font-mono-data text-slate-600">
          Where monitored devices are located - not attack origins.
        </p>
      </div>
    </div>
  );
};
