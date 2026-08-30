import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Monitor, Camera, ZoomIn, ZoomOut, Plus, X, RotateCcw } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import ResizableBox, { loadBoxSize, clearAllBoxSizes, type BoxSize } from '../components/ResizableBox';
import { useDevices } from '../context/DeviceContext';
import { API_BASE } from '../utils/api';

type Source = 'screen' | 'camera';

interface Tile {
  id: string;
  hostname: string;
  src: string;
  zoom: number;
  error: boolean;
}

const TILE_MIN: BoxSize = { w: 220, h: 150 };
const TILE_MAX: BoxSize = { w: 1800, h: 1400 };

/**
 * More Feature — a full page (not a small panel) for watching many devices at
 * once. Reachable from Live Monitor, Webcam and Touch Control.
 *
 * Gestures on a tile:
 *   triple click → zoom in
 *   double click → zoom out
 *   drag a corner / edge handle → resize the tile (persisted per device)
 *   double-click a handle → put that tile back to its default size
 * (Double-click is delayed slightly so a triple click is not read as a
 * double-click first.)
 */
const DeviceWall: React.FC = () => {
  const { devices, selectedDeviceId, setSelectedDeviceId } = useDevices();
  const [source, setSource] = useState<Source>('screen');
  const [watched, setWatched] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [tiles, setTiles] = useState<Record<string, Tile>>({});
  const [sizes, setSizes] = useState<Record<string, BoxSize>>({});
  const [containerWidth, setContainerWidth] = useState(0);
  const clickTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wallRef = useRef<HTMLDivElement>(null);

  const onlineDevices = devices.filter(d => d.status === 'online');

  const sizeKey = useCallback((id: string) => `wall.${source}.${id}`, [source]);

  /**
   * Default tile size, derived from the wall's real width so an unresized wall
   * still reads as the same 1 / 2 / 3-across layout it always had.
   */
  const defaultTileSize = useMemo<BoxSize>(() => {
    const gap = 16;
    const cols = containerWidth >= 1280 ? 3 : containerWidth >= 720 ? 2 : 1;
    const usable = containerWidth > 0 ? containerWidth : 1100;
    const w = Math.round((usable - gap * (cols - 1)) / cols);
    const clamped = Math.min(TILE_MAX.w, Math.max(TILE_MIN.w, w));
    return { w: clamped, h: Math.min(TILE_MAX.h, Math.max(TILE_MIN.h, Math.round(clamped * 0.55))) };
  }, [containerWidth]);

  // Measure the wall so the defaults above track the real available width.
  useEffect(() => {
    const el = wallRef.current;
    if (!el) return;
    setContainerWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) setContainerWidth(Math.round(entry.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [Object.keys(tiles).length]);

  /** A tile's size: what the operator dragged it to, else what was saved, else default. */
  const sizeFor = useCallback((id: string): BoxSize => {
    return sizes[id] ?? loadBoxSize(sizeKey(id)) ?? defaultTileSize;
  }, [sizes, sizeKey, defaultTileSize]);

  const resetLayout = () => {
    clearAllBoxSizes(`wall.${source}.`);
    setSizes({});
  };

  // Keep one tile per watched device, in sync with the device list.
  useEffect(() => {
    setTiles(prev => {
      const next: Record<string, Tile> = {};
      for (const id of watched) {
        const d = devices.find(x => x.id === id);
        if (!d) continue;
        next[id] = prev[id]
          ? { ...prev[id], hostname: d.hostname }
          : { id, hostname: d.hostname, src: '', zoom: 1, error: false };
      }
      return next;
    });
  }, [watched, devices]);

  const endpoint = useCallback(
    (id: string) => `${API_BASE}/api/${source === 'screen' ? 'screenshot' : 'webcam'}/${id}/latest`,
    [source],
  );

  /** Force every tile to reload its frame. Cache-busted so the browser refetches. */
  const refreshTiles = useCallback(() => {
    const stamp = Date.now();
    setTiles(prev => {
      const next: Record<string, Tile> = {};
      for (const [id, t] of Object.entries(prev)) {
        next[id] = { ...t, src: `${endpoint(id)}?t=${stamp}` };
      }
      return next;
    });
  }, [endpoint]);

  useEffect(() => {
    refreshTiles();
    refreshRef.current = setInterval(refreshTiles, 1000);
    return () => { if (refreshRef.current) clearInterval(refreshRef.current); };
  }, [refreshTiles, watched.length]);

  const setZoom = (id: string, delta: number) =>
    setTiles(prev => prev[id]
      ? { ...prev, [id]: { ...prev[id], zoom: Math.min(4, Math.max(1, +(prev[id].zoom + delta).toFixed(2))) } }
      : prev);

  /**
   * Triple click zooms in, double click zooms out.
   * The double-click action is deferred so three fast clicks read as a triple.
   */
  const handleClick = (id: string) => {
    const state = clickTimers.current[id] as any;
    const count = (state?.count ?? 0) + 1;

    if (state?.timer) clearTimeout(state.timer);

    const timer = setTimeout(() => {
      if (count === 2) setZoom(id, -0.5);      // double click → zoom out
      else if (count >= 3) setZoom(id, +0.5);  // triple click → zoom in
      clickTimers.current[id] = undefined as any;
    }, 320);

    clickTimers.current[id] = { timer, count } as any;
  };

  useEffect(() => () => {
    Object.values(clickTimers.current).forEach((v: any) => v?.timer && clearTimeout(v.timer));
  }, []);

  const addDevice = (id: string) => {
    setWatched(prev => prev.includes(id) ? prev : [...prev, id]);
    setAdding(false);
  };

  const removeDevice = (id: string) => setWatched(prev => prev.filter(x => x !== id));

  const tileList = Object.values(tiles);

  return (
    <div className="space-y-4">
      <PageHeader
        title={source === 'screen' ? 'MULTI-MONITOR' : 'MULTI-CAM'}
        highlight={source === 'screen' ? 'MONITOR' : 'CAM'}
        subtitle={source === 'screen' ? 'Watch several screens at once' : 'Watch several cameras at once'}
        right={
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-white/10 overflow-hidden">
              {([
                { id: 'screen', label: 'Screen', icon: <Monitor size={13} /> },
                { id: 'camera', label: 'Camera', icon: <Camera size={13} /> },
              ] as const).map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setSource(opt.id)}
                  className={`px-3 py-2 flex items-center gap-1.5 text-[9px] font-orbitron uppercase transition-colors ${
                    source === opt.id ? 'bg-green-600 text-white' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {opt.icon}{opt.label}
                </button>
              ))}
            </div>
            <button
              onClick={resetLayout}
              title="Put every tile back to its default size"
              className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-green-300 hover:border-green-500/40 transition-all flex items-center gap-1.5 text-[9px] font-orbitron uppercase"
            >
              <RotateCcw size={13} /> Reset
            </button>
            <button
              onClick={() => setAdding(true)}
              className="px-3 py-2 rounded-lg bg-green-600/20 border border-green-500/40 text-green-300 hover:bg-green-600 hover:text-white transition-all flex items-center gap-1.5 text-[9px] font-orbitron uppercase"
            >
              <Plus size={13} /> Add device
            </button>
          </div>
        }
      />

      <div className="glass-card p-3 flex items-center justify-between flex-wrap gap-2">
        <p className="text-[10px] font-mono-data text-slate-500">
          {tileList.length} device(s) on the wall · {source === 'screen' ? 'screens' : 'cameras'} refresh every 1s
        </p>
        <p className="text-[9px] font-mono-data text-slate-600">
          drag a tile&apos;s corner or edge to resize · double-click a handle to reset · triple click to zoom in · double click to zoom out
        </p>
      </div>

      <div ref={wallRef}>
        {tileList.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <Monitor size={40} className="mx-auto text-slate-700 mb-4" />
            <p className="text-[11px] font-orbitron uppercase tracking-widest text-slate-500">
              No devices on the wall yet
            </p>
            <p className="text-[10px] font-mono-data text-slate-600 mt-2">
              Choose “Add device” to start watching. Only online devices can stream.
            </p>
          </div>
        ) : (
          /* Flex wrap rather than a CSS grid: each tile keeps the exact size the
             operator dragged it to instead of being stretched to its row. */
          <div className="flex flex-wrap gap-4 items-start">
            {tileList.map(t => (
              <ResizableBox
                key={t.id}
                storageKey={sizeKey(t.id)}
                size={sizeFor(t.id)}
                defaultSize={defaultTileSize}
                min={TILE_MIN}
                max={TILE_MAX}
                label={t.hostname}
                onResize={next => setSizes(prev => ({ ...prev, [t.id]: next }))}
                className="glass-card border-green-500/10"
              >
                <div className="absolute inset-0 overflow-hidden rounded-2xl flex flex-col">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-green-500/10 bg-black/30 shrink-0">
                    <button
                      onClick={() => setSelectedDeviceId(t.id)}
                      className="text-[10px] font-orbitron uppercase tracking-widest text-green-400 hover:text-green-300 truncate"
                      title="Set as Target Node"
                    >
                      {t.hostname}
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => setZoom(t.id, +0.5)} title="Zoom in"
                        className="p-1 rounded text-slate-500 hover:text-green-400"><ZoomIn size={13} /></button>
                      <span className="text-[9px] font-mono-data text-slate-500 w-9 text-center">
                        {Math.round(t.zoom * 100)}%
                      </span>
                      <button onClick={() => setZoom(t.id, -0.5)} title="Zoom out"
                        className="p-1 rounded text-slate-500 hover:text-green-400"><ZoomOut size={13} /></button>
                      <button onClick={() => removeDevice(t.id)} title="Remove from wall"
                        className="p-1 rounded text-slate-500 hover:text-red-400"><X size={13} /></button>
                    </div>
                  </div>

                  <div
                    className="flex-1 min-h-0 bg-black overflow-hidden cursor-pointer select-none"
                    onClick={() => handleClick(t.id)}
                    title="Triple click = zoom in · double click = zoom out"
                  >
                    {t.src && !t.error ? (
                      <img
                        src={t.src}
                        alt={`${t.hostname} ${source}`}
                        className="w-full h-full object-contain"
                        style={{ transform: `scale(${t.zoom})`, transformOrigin: 'center center' }}
                        onError={() => setTiles(prev => prev[t.id]
                          ? { ...prev, [t.id]: { ...prev[t.id], error: true } }
                          : prev)}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <p className="text-[9px] font-mono-data text-slate-600">
                          {source === 'screen' ? 'No frame from this agent yet' : 'Camera not streaming'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </ResizableBox>
            ))}
          </div>
        )}
      </div>

      {adding && (
        <div className="fixed inset-0 z-[200] bg-black/70 flex items-center justify-center p-4" onClick={() => setAdding(false)}>
          <div className="glass-card border-green-500/30 w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-orbitron uppercase tracking-widest text-green-400">Add device to wall</p>
              <button onClick={() => setAdding(false)} className="text-slate-500 hover:text-white"><X size={16} /></button>
            </div>
            <div className="space-y-1.5 max-h-72 overflow-y-auto aeyes-scroll">
              {devices.map(d => {
                const on = d.status === 'online';
                const already = watched.includes(d.id);
                return (
                  <button
                    key={d.id}
                    onClick={() => on && !already && addDevice(d.id)}
                    disabled={!on || already}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-white/5 bg-white/[0.03] hover:bg-green-500/10 transition-colors disabled:opacity-35 disabled:cursor-not-allowed text-left"
                  >
                    <div className="min-w-0">
                      <p className="text-[11px] font-orbitron text-slate-200 truncate">{d.hostname}</p>
                      <p className="text-[9px] font-mono-data text-slate-500">{d.ip} · {d.status}</p>
                    </div>
                    <span className="text-[8px] font-orbitron uppercase text-slate-500">
                      {already ? 'on wall' : on ? 'add' : 'offline'}
                    </span>
                  </button>
                );
              })}
              {devices.length === 0 && (
                <p className="text-[10px] font-mono-data text-slate-600 py-4 text-center">No devices registered.</p>
              )}
            </div>
            <p className="mt-3 text-[9px] font-mono-data text-slate-600">
              {onlineDevices.length} of {devices.length} devices are online and can stream.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeviceWall;
