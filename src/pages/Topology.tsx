import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ZoomIn, ZoomOut, Maximize2, RotateCw, Trash2, Unplug, ExternalLink, Network,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import DeviceIcon from '../components/DeviceIcon';
import IconModeToggle from '../components/IconModeToggle';
import { useDevices } from '../context/DeviceContext';
import { API_BASE } from '../utils/api';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { NodeLinks } from '../components/analysis/NetworkSensors';

/**
 * TOPOLOGY ANALYSIS
 *
 * Part 1 - the network map. ALL EYES X is the hub; every monitored device is a
 * node on a tilted plane. Pseudo-3D is done with CSS transforms only (perspective
 * + rotateX + rotateZ), so there is no 3D dependency and the animation stays on
 * the compositor.
 *
 * Part 2 - device-to-device links. Shown as an explicit "sensor required" state,
 * because links between hosts need ARP / routing-table / LLDP collection that the
 * agent does not do. Drawing invented links would be worse than showing none.
 *
 * Nothing here is decorative data: node position is a layout choice, but every
 * node, its status, its OS and its risk come from the API. A link is drawn only
 * between the hub and a device that is actually reporting.
 */

const PLANE = 620;          // px, unscaled
const RADIUS = 232;         // ring radius in plane px
const TILT = 58;            // deg, rotateX
const MIN_ZOOM = 0.45;
const MAX_ZOOM = 2.2;

const RISK_COLOR: Record<string, string> = {
  LOW: '#22c55e', MEDIUM: '#eab308', HIGH: '#f97316', CRITICAL: '#ef4444',
};

interface Node {
  id: string;
  name: string;
  os: string;
  ip: string;
  status: string;
  online: boolean;
  risk: number;
  riskLevel: string;
  isVm: boolean;
  hypervisor: string;
  x: number;
  y: number;
}

const Topology: React.FC = () => {
  const navigate = useNavigate();
  const { devices, refreshDevices, removeDevice } = useDevices();
  const reduced = useReducedMotion();

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [spin, setSpin] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'disconnect' | 'remove' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const dragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  const nodes: Node[] = useMemo(() => {
    const n = Math.max(devices.length, 1);
    return devices.map((d: any, i: number) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      const online = String(d.status ?? '').toLowerCase() === 'online';
      return {
        id: d.id ?? d.device_id ?? `d-${i}`,
        name: d.hostname || 'device',
        os: d.os_name || d.os || '',
        ip: d.ip || '',
        status: d.status || 'offline',
        online,
        risk: typeof d.risk === 'number' ? d.risk : 0,
        riskLevel: d.risk_level || 'LOW',
        isVm: Boolean(d.is_vm),
        hypervisor: d.hypervisor || '',
        x: PLANE / 2 + Math.cos(a) * RADIUS,
        y: PLANE / 2 + Math.sin(a) * RADIUS,
      };
    });
  }, [devices]);

  const active = nodes.find(n => n.id === selected) ?? null;
  const onlineCount = nodes.filter(n => n.online).length;

  // Slow turntable. requestAnimationFrame is used only while spinning is on, and
  // never under reduced motion.
  const rafRef = useRef<number | null>(null);
  React.useEffect(() => {
    if (!spin || reduced) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      setRotation(r => (r + dt * 0.006) % 360);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [spin, reduced]);

  const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setPan({ x: d.px + (e.clientX - d.x), y: d.py + (e.clientY - d.y) });
  };
  const endDrag = () => { dragRef.current = null; };

  const onWheel = useCallback((e: React.WheelEvent) => {
    setZoom(z => clampZoom(z + (e.deltaY < 0 ? 0.12 : -0.12)));
  }, []);

  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); setRotation(0); };

  const act = async (kind: 'disconnect' | 'remove') => {
    if (!active || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      if (kind === 'remove') {
        // Reuse the context action so removal behaves identically everywhere.
        const ok = await removeDevice(active.id);
        setMessage(ok
          ? `${active.name} removed from the inventory.`
          : 'Removal failed.');
        if (ok) setSelected(null);
      } else {
        const res = await fetch(
          `${API_BASE}/api/device/${encodeURIComponent(active.id)}/disconnect`,
          { method: 'POST', credentials: 'include' },
        );
        const body = await res.json().catch(() => ({}));
        if (res.ok) {
          setMessage(`Disconnect queued for ${active.name}. It stops on the agent's next heartbeat; the record is kept.`);
          setSelected(null);
          await refreshDevices();
        } else {
          setMessage(body?.error || `Action failed (${res.status})`);
        }
      }
    } catch {
      setMessage('Request failed.');
    } finally {
      setBusy(false);
      setConfirmAction(null);
    }
  };

  const planeTransform =
    `translate3d(${pan.x}px, ${pan.y}px, 0) perspective(1200px) rotateX(${TILT}deg) rotateZ(${rotation}deg) scale(${zoom})`;

  return (
    <div className="space-y-5">
      <PageHeader
        size="hero"
        hideBack
        title="TOPOLOGY"
        subtitle="Network Structure &amp; Node Relationships"
        right={
          <div className="flex items-center gap-2 text-[9px] font-orbitron uppercase tracking-[0.16em]">
            <span className="px-2.5 py-1 rounded-md border border-green-500/25 text-green-400 bg-green-500/[0.07]">
              {onlineCount}/{nodes.length} online
            </span>
            <span className="px-2.5 py-1 rounded-md border border-white/10 text-slate-400 bg-slate-800/40">
              {Math.round(zoom * 100)}%
            </span>
          </div>
        }
      />

      {/* ---------------- PART 1 — the map ---------------- */}
      <div className="aeyes-inset glass-card overflow-hidden">
        <span className="aeyes-inset__corner aeyes-inset__corner--tl" aria-hidden="true" />
        <span className="aeyes-inset__corner aeyes-inset__corner--tr" aria-hidden="true" />
        <span className="aeyes-inset__corner aeyes-inset__corner--bl" aria-hidden="true" />
        <span className="aeyes-inset__corner aeyes-inset__corner--br" aria-hidden="true" />

        <div className="px-5 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-white/5">
          <h2 className="aeyes-inset__title text-sm font-orbitron font-bold tracking-[0.18em] text-white uppercase">
            Network Map
          </h2>
          <div className="flex flex-wrap items-center gap-1.5">
            <IconModeToggle />
            <button onClick={() => setZoom(z => clampZoom(z + 0.15))} title="Zoom in"
              className="p-2 rounded-lg border border-white/10 text-slate-400 hover:text-green-300 hover:border-green-500/40 transition-all"><ZoomIn size={14} /></button>
            <button onClick={() => setZoom(z => clampZoom(z - 0.15))} title="Zoom out"
              className="p-2 rounded-lg border border-white/10 text-slate-400 hover:text-green-300 hover:border-green-500/40 transition-all"><ZoomOut size={14} /></button>
            <button onClick={resetView} title="Reset view"
              className="p-2 rounded-lg border border-white/10 text-slate-400 hover:text-green-300 hover:border-green-500/40 transition-all"><Maximize2 size={14} /></button>
            <button onClick={() => setRotation(r => (r + 30) % 360)} title="Rotate 30°"
              className="p-2 rounded-lg border border-white/10 text-slate-400 hover:text-green-300 hover:border-green-500/40 transition-all"><RotateCw size={14} /></button>
            {!reduced && (
              <button onClick={() => setSpin(s => !s)} title="Toggle slow rotation"
                className={`px-3 py-2 rounded-lg border text-[9px] font-orbitron uppercase tracking-[0.14em] transition-all ${
                  spin ? 'border-green-500/50 bg-green-500/10 text-green-300'
                       : 'border-white/10 text-slate-400 hover:text-green-300 hover:border-green-500/40'}`}>
                {spin ? 'Spinning' : 'Rotate'}
              </button>
            )}
          </div>
        </div>

        {/* Viewport: drag to pan, wheel to zoom. overflow-hidden keeps the tilted
            plane from ever causing horizontal page overflow. */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onWheel={onWheel}
          className="relative w-full overflow-hidden bg-black/40 cursor-grab active:cursor-grabbing touch-none select-none"
          style={{ height: 460 }}
        >
          {nodes.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <Network size={30} className="text-slate-700 mb-3" />
              <p className="text-[10px] font-orbitron uppercase tracking-[0.18em] text-slate-500">
                No devices registered
              </p>
              <p className="mt-1 text-[10px] font-mono-data text-slate-600">
                Nodes appear as agents register.
              </p>
            </div>
          ) : (
            <div
              className="absolute left-1/2 top-1/2"
              style={{
                width: PLANE, height: PLANE,
                marginLeft: -PLANE / 2, marginTop: -PLANE / 2,
                transform: planeTransform,
                transformStyle: 'preserve-3d',
              }}
            >
              {/* Links: hub -> device. Only real, reporting devices get a live
                  animated link; offline ones get a dim static line. */}
              <svg width={PLANE} height={PLANE} className="absolute inset-0 pointer-events-none">
                {/* Matrix square grid: the plane reads as a measured floor, and
                    the perspective transform turns the squares into depth cues. */}
                <defs>
                  <pattern id="aeyes-topo-grid" width="44" height="44" patternUnits="userSpaceOnUse">
                    <path d="M44 0H0V44" fill="none" stroke="rgba(34,197,94,0.14)" strokeWidth="1" />
                  </pattern>
                  <pattern id="aeyes-topo-grid-major" width="220" height="220" patternUnits="userSpaceOnUse">
                    <path d="M220 0H0V220" fill="none" stroke="rgba(34,197,94,0.22)" strokeWidth="1" />
                  </pattern>
                </defs>
                <rect width={PLANE} height={PLANE} fill="url(#aeyes-topo-grid)" />
                <rect width={PLANE} height={PLANE} fill="url(#aeyes-topo-grid-major)" />
                {nodes.map(n => (
                  <line
                    key={`link-${n.id}`}
                    x1={PLANE / 2} y1={PLANE / 2} x2={n.x} y2={n.y}
                    stroke={n.online ? 'rgba(34,197,94,0.45)' : 'rgba(148,163,184,0.18)'}
                    strokeWidth={n.online ? 1.4 : 1}
                    strokeDasharray={n.online && !reduced ? '6 10' : undefined}
                    className={n.online && !reduced ? 'aeyes-topo-flow' : undefined}
                  />
                ))}
                <circle cx={PLANE / 2} cy={PLANE / 2} r={RADIUS} fill="none"
                  stroke="rgba(34,197,94,0.10)" strokeWidth={1} strokeDasharray="3 7" />
              </svg>

              {/* Hub */}
              <div
                className="absolute rounded-full border-2 border-green-500/60 bg-green-500/10 flex items-center justify-center"
                style={{
                  width: 84, height: 84, left: PLANE / 2 - 42, top: PLANE / 2 - 42,
                  boxShadow: '0 0 26px rgba(34,197,94,0.25)',
                  // Counter-rotate so the hub label stays upright and readable.
                  transform: `rotateZ(${-rotation}deg) rotateX(${-TILT}deg)`,
                }}
              >
                <div className="text-center">
                  <p className="text-[9px] font-orbitron tracking-[0.14em] text-green-300">ALL EYES X</p>
                  <p className="text-[8px] font-mono-data text-green-500/70">hub</p>
                </div>
              </div>

              {/* Nodes */}
              {nodes.map(n => {
                const isSel = n.id === selected;
                const color = RISK_COLOR[n.riskLevel] ?? '#94a3b8';
                return (
                  <button
                    key={n.id}
                    onClick={e => { e.stopPropagation(); setSelected(isSel ? null : n.id); }}
                    className="absolute text-center"
                    style={{
                      left: n.x - 46, top: n.y - 34, width: 92,
                      transform: `rotateZ(${-rotation}deg) rotateX(${-TILT}deg)`,
                    }}
                    title={`${n.name} — ${n.status}`}
                  >
                    <span
                      className={`mx-auto flex items-center justify-center w-11 h-11 rounded-xl border transition-all ${
                        isSel ? 'border-green-400 bg-green-500/20' : 'border-white/10 bg-slate-900/70'
                      }`}
                      style={{ boxShadow: isSel ? `0 0 18px ${color}55` : 'none' }}
                    >
                      <span className={n.online ? 'text-green-400' : 'text-slate-500'}>
                        <DeviceIcon hostname={n.name} os={n.os} size={22} online={n.online} />
                      </span>
                    </span>
                    {/* Labels sit on a dark chip with a shadow so they stay
                        legible over the grid and the glow of neighbouring nodes. */}
                    <span className="mt-1 block text-[10px] font-rajdhani font-semibold text-slate-100 truncate rounded bg-[#060812]/80 px-1"
                      style={{ textShadow: '0 1px 2px rgba(0,0,0,0.9)' }}>{n.name}</span>
                    <span className="block text-[9px] font-mono-data text-slate-400 truncate rounded bg-[#060812]/80 px-1"
                      style={{ textShadow: '0 1px 2px rgba(0,0,0,0.9)' }}>{n.ip}</span>
                    <span className="mt-0.5 inline-flex items-center gap-1 rounded bg-[#060812]/80 px-1">
                      <span className="w-1.5 h-1.5 rounded-full"
                        style={{ background: n.online ? color : '#64748b' }} />
                      <span className="text-[8px] font-orbitron uppercase tracking-[0.12em]"
                        style={{ color: n.online ? color : '#94a3b8' }}>{n.riskLevel}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <p className="px-5 py-2 text-[9px] font-mono-data text-slate-600 border-t border-white/5">
          Drag to pan · scroll to zoom · click a node to inspect it. An animated link means that agent
          is reporting right now; a dim line means it is not.
        </p>
      </div>

      {/* ---------------- selected node ---------------- */}
      <AnimatePresence>
        {active && (
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.3 }}
            className="aeyes-inset glass-card p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className={active.online ? 'text-green-400' : 'text-slate-600'}>
                  <DeviceIcon hostname={active.name} os={active.os} size={38} online={active.online} />
                </span>
                <div>
                  <p className="text-sm font-rajdhani text-white">{active.name}</p>
                  <p className="text-[10px] font-mono-data text-slate-400">
                    {active.os || 'OS not reported'} · {active.ip}
                    {active.isVm && ` · VM ${active.hypervisor}`}
                  </p>
                  <p className="text-[9px] font-orbitron uppercase tracking-[0.14em] mt-0.5"
                    style={{ color: RISK_COLOR[active.riskLevel] ?? '#94a3b8' }}>
                    risk {active.risk} · {active.riskLevel} · {active.status}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => navigate(`/device/${active.id}`)}
                  className="px-3 py-2 rounded-lg border border-green-500/30 bg-green-500/[0.07] text-[9px] font-orbitron uppercase tracking-[0.14em] text-green-300 hover:bg-green-500/15 transition-all flex items-center gap-1.5">
                  <ExternalLink size={12} /> Open device
                </button>
                <button
                  onClick={() => setConfirmAction(confirmAction === 'disconnect' ? null : 'disconnect')}
                  disabled={busy}
                  className="px-3 py-2 rounded-lg border border-amber-500/30 text-[9px] font-orbitron uppercase tracking-[0.14em] text-amber-300 hover:bg-amber-500/10 transition-all flex items-center gap-1.5 disabled:opacity-50">
                  <Unplug size={12} /> Break connection
                </button>
                <button
                  onClick={() => setConfirmAction(confirmAction === 'remove' ? null : 'remove')}
                  disabled={busy}
                  className="px-3 py-2 rounded-lg border border-red-500/30 text-[9px] font-orbitron uppercase tracking-[0.14em] text-red-300 hover:bg-red-500/10 transition-all flex items-center gap-1.5 disabled:opacity-50">
                  <Trash2 size={12} /> Delete device
                </button>
              </div>
            </div>

            {confirmAction && (
              <div className="mt-4 rounded-lg border border-white/10 bg-slate-900/40 p-4">
                <p className="text-[10px] font-mono-data text-slate-300 leading-relaxed">
                  {confirmAction === 'disconnect'
                    ? `Ask ${active.name} to stop reporting. The command is queued and picked up on the agent's next heartbeat, and the action is audited. The device record is kept, so it can register again.`
                    : `Remove ${active.name} from the inventory. This soft-deletes the record; an agent that is still running will register again on its next heartbeat.`}
                </p>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => act(confirmAction)} disabled={busy}
                    className={`px-3 py-1.5 rounded-lg border text-[9px] font-orbitron uppercase tracking-[0.14em] transition-all disabled:opacity-50 ${
                      confirmAction === 'remove'
                        ? 'border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20'
                        : 'border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'}`}>
                    {busy ? 'Working…' : 'Confirm'}
                  </button>
                  <button onClick={() => setConfirmAction(null)} disabled={busy}
                    className="px-3 py-1.5 rounded-lg border border-white/10 text-[9px] font-orbitron uppercase tracking-[0.14em] text-slate-400 hover:text-slate-200 transition-all disabled:opacity-50">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {message && (
              <p className="mt-3 text-[10px] font-mono-data text-green-300/90">{message}</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------------- PART 2 — device-to-node links ---------------- */}
      <div className="aeyes-inset glass-card p-5">
        <h2 className="aeyes-inset__title text-sm font-orbitron font-bold tracking-[0.18em] text-white uppercase mb-3">
          Node-to-Node Links
        </h2>
        <NodeLinks />
      </div>

    </div>
  );
};

export default Topology;
