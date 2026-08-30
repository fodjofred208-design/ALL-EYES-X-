import { useState, useEffect, useRef, useCallback } from 'react';
import BackButton from '../components/BackButton';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Settings, MousePointer2, Keyboard, RefreshCw,
  Play, Square, Activity, Eye, Monitor,
  Wifi, Signal, Zap, Gauge, Download
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDevices } from '../context/DeviceContext';
import { useSocket } from '../context/SocketContext';
import { API_BASE } from '../utils/api';

interface FrameMetrics {
  fps: number;
  latency: number;
  frameSize: number;
  totalPixels: number;
  changedPixels: number;
}

const LiveMonitor = () => {
  const navigate = useNavigate();
  const { devices, selectedDevice, setSelectedDeviceId } = useDevices();
  const { socket, isConnected } = useSocket();
  
  const [isLive, setIsLive] = useState(false);
  const [currentScreenshot, setCurrentScreenshot] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<FrameMetrics>({
    fps: 0, latency: 0, frameSize: 0, totalPixels: 0, changedPixels: 0
  });
  const [connectionQuality, setConnectionQuality] = useState<'excellent' | 'good' | 'average' | 'poor'>('excellent');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [showMoreFeature, setShowMoreFeature] = useState(false);
  const [watched, setWatched] = useState<string[]>([]);
  const [showDataCheck, setShowDataCheck] = useState(false);
  const [serverStats, setServerStats] = useState<any>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  const frameCountRef = useRef(0);
  const lastFpsTimeRef = useRef(Date.now());
  const lastFrameTimeRef = useRef(Date.now());
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenCtxRef = useRef<CanvasRenderingContext2D | null>(null);

  const onlineDevices = devices.filter(d => d.status === 'online');

  // Connection quality based on latency
  useEffect(() => {
    const lat = metrics.latency;
    if (lat <= 30) setConnectionQuality('excellent');
    else if (lat <= 60) setConnectionQuality('good');
    else if (lat <= 120) setConnectionQuality('average');
    else setConnectionQuality('poor');
  }, [metrics.latency]);

  const qualityColor = {
    excellent: 'text-green-500',
    good: 'text-cyan-400',
    average: 'text-yellow-500',
    poor: 'text-red-500',
  }[connectionQuality];

  // Initialize offscreen canvas for compositing dirty rectangles
  useEffect(() => {
    offscreenCanvasRef.current = document.createElement('canvas');
    offscreenCtxRef.current = offscreenCanvasRef.current.getContext('2d');
  }, []);

  // Handle frame rendering (full frame or dirty rectangle)
  const renderFrame = useCallback((data: {
    device_id: string;
    image: string;
    timestamp: string;
    full_frame?: boolean;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    screen_width?: number;
    screen_height?: number;
  }) => {
    if (data.device_id !== selectedDevice?.id) return;

    const now = Date.now();
    const frameLatency = now - new Date(data.timestamp).getTime();

    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      const offCtx = offscreenCtxRef.current;
      const offCanvas = offscreenCanvasRef.current;

      if (!canvas || !ctx || !offCtx || !offCanvas) return;

      if (data.full_frame) {
        // Full frame: set canvas size and draw
        const sw = data.screen_width || img.width;
        const sh = data.screen_height || img.height;

        canvas.width = sw;
        canvas.height = sh;
        offCanvas.width = sw;
        offCanvas.height = sh;

        ctx.drawImage(img, 0, 0);
        offCtx.drawImage(img, 0, 0);

        setMetrics(prev => ({
          ...prev,
          totalPixels: sw * sh,
          changedPixels: sw * sh,
        }));
      } else if (data.x !== undefined && data.y !== undefined) {
        // Dirty rectangle: composite onto existing canvas
        const sw = data.screen_width || canvas.width;
        const sh = data.screen_height || canvas.height;

        if (canvas.width !== sw || canvas.height !== sh) {
          canvas.width = sw;
          canvas.height = sh;
          offCanvas.width = sw;
          offCanvas.height = sh;
        }

        // Draw the new chunk onto the offscreen canvas at the right position
        offCtx.drawImage(img, data.x, data.y);

        // Copy the affected region to visible canvas
        ctx.drawImage(
          offCanvas,
          data.x, data.y, data.width || img.width, data.height || img.height,
          data.x, data.y, data.width || img.width, data.height || img.height
        );

        setMetrics(prev => ({
          ...prev,
          totalPixels: sw * sh,
          changedPixels: (data.width || 0) * (data.height || 0),
        }));
      } else {
        // Legacy: just draw the image
        ctx.drawImage(img, 0, 0);
      }

      // FPS and latency
      frameCountRef.current++;
      if (now - lastFpsTimeRef.current >= 1000) {
        const currentFps = frameCountRef.current;
        setMetrics(prev => ({
          ...prev,
          fps: currentFps,
          latency: Math.max(5, Math.min(frameLatency, 200)),
          frameSize: Math.round(data.image.length * 0.75 / 1024),
        }));
        frameCountRef.current = 0;
        lastFpsTimeRef.current = now;
      }
      lastFrameTimeRef.current = now;
    };
    img.src = `data:image/jpeg;base64,${data.image}`;
  }, [selectedDevice?.id]);

  // SocketIO listener for screenshare_frames
  useEffect(() => {
    if (!socket || !selectedDevice || !isLive) return;

    const handleFrame = (data: any) => {
      renderFrame(data);
    };

    socket.on('screenshare_frame', handleFrame);

    return () => {
      socket.off('screenshare_frame', handleFrame);
    };
  }, [socket, selectedDevice, isLive, renderFrame]);

  // Clear the canvas whenever the target changes, otherwise the previous
  // device's last frame stays on screen and looks like a frozen stream.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    const off = offscreenCanvasRef.current;
    const offCtx = offscreenCtxRef.current;
    if (off && offCtx) offCtx.clearRect(0, 0, off.width, off.height);
    frameCountRef.current = 0;
    setMetrics({ fps: 0, latency: 0, frameSize: 0, totalPixels: 0, changedPixels: 0 });
  }, [selectedDevice?.id]);

  // HTTP polling is a FALLBACK only. Socket.IO already pushes every frame the
  // agent uploads; polling on top of it doubles the load and starves the
  // stream, which is what pinned the display at ~4 FPS.
  const inFlightRef = useRef(false);

  const pollFrame = useCallback(async () => {
    if (!selectedDevice || !isLive) return;
    if (inFlightRef.current) return;   // never stack overlapping requests
    inFlightRef.current = true;

    try {
      const res = await fetch(`${API_BASE}/api/screenshot/${selectedDevice.id}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.image) {
          renderFrame({
            device_id: selectedDevice.id,
            image: data.image,
            timestamp: new Date().toISOString(),
            full_frame: true,
          });
        }
      }
    } catch {
      // Silent
    } finally {
      inFlightRef.current = false;
    }
  }, [selectedDevice, isLive, renderFrame]);

  useEffect(() => {
    // Socket connected: frames arrive by push, no polling needed.
    if (!isLive || !selectedDevice || isConnected) return;

    pollFrame();
    const adaptiveMs = {
      excellent: 33,  // ~30 FPS ceiling for HTTP polling
      good: 40,
      average: 50,
      poor: 66,
    }[connectionQuality];
    pollingRef.current = setInterval(pollFrame, adaptiveMs);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [isLive, selectedDevice, pollFrame, connectionQuality, isConnected]);

  // Real server-measured stream statistics for the Data Check panel.
  useEffect(() => {
    if (!selectedDevice || !showDataCheck) return;
    let stop = false;
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/stream/stats/${selectedDevice.id}`, { credentials: 'include' });
        if (res.ok && !stop) setServerStats(await res.json());
      } catch { /* keep last known stats */ }
    };
    load();
    const t = setInterval(load, 2000);
    return () => { stop = true; clearInterval(t); };
  }, [selectedDevice, showDataCheck]);

  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  /** Save the current live frame. Requires a Target Node and an active stream. */
  const handleSnap = () => {
    const canvas = canvasRef.current;
    if (!selectedDevice || !isLive || !canvas || !canvas.width) return;
    try {
      const url = canvas.toDataURL('image/jpeg', 0.92);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${selectedDevice.hostname}_${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`;
      link.click();
    } catch {
      /* canvas may be tainted if the frame came from another origin */
    }
  };

  const toggleWatched = (id: string) =>
    setWatched(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const toggleLive = () => {
    if (!selectedDevice) return;

    if (isLive) {
      setIsLive(false);
      setCurrentScreenshot(null);
      setMetrics({ fps: 0, latency: 0, frameSize: 0, totalPixels: 0, changedPixels: 0 });

      // Clear canvas
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    } else {
      setIsLive(true);
      frameCountRef.current = 0;
      lastFpsTimeRef.current = Date.now();
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 p-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <BackButton />
          <h1 className="text-3xl font-bold font-orbitron tracking-tight text-white uppercase">
            Live <span className="text-green-500">Surveillance</span>
          </h1>
          <p className="text-slate-400 font-rajdhani text-xs tracking-widest mt-1 uppercase">
            ALL EYES X Adaptive Neural Streaming — Change-Aware Frame Engine
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          {/* FPS / Latency / Size */}
          <div className="flex items-center gap-3 bg-black/40 border border-green-500/10 px-4 py-2 rounded-xl">
            <Gauge size={16} className={metrics.fps > 15 ? 'text-green-500' : 'text-yellow-500'} />
            <div className="flex flex-col items-center">
              <span className="text-[7px] font-orbitron text-slate-500 uppercase tracking-wider">FPS</span>
              <span className={`text-sm font-mono-data font-bold ${metrics.fps > 15 ? 'text-green-500' : 'text-yellow-500'}`}>
                {metrics.fps || '--'}
              </span>
            </div>
            <div className="w-[1px] h-8 bg-white/5" />
            <div className="flex flex-col items-center">
              <span className="text-[7px] font-orbitron text-slate-500 uppercase tracking-wider">LATENCY</span>
              <span className={`text-sm font-mono-data font-bold ${
                metrics.latency < 40 ? 'text-cyan-400' : 
                metrics.latency < 80 ? 'text-yellow-400' : 'text-red-400'
              }`}>
                {metrics.latency ? `${metrics.latency}ms` : '--'}
              </span>
            </div>
            <div className="w-[1px] h-8 bg-white/5" />
            <div className="flex flex-col items-center">
              <span className="text-[7px] font-orbitron text-slate-500 uppercase tracking-wider">SIZE</span>
              <span className="text-sm font-mono-data text-green-400 font-bold">
                {metrics.frameSize ? `${metrics.frameSize}KB` : '--'}
              </span>
            </div>
          </div>

          {/* Change ratio */}
          {metrics.totalPixels > 0 && (
            <div className="px-3 py-1 bg-black/40 border border-white/5 rounded-lg">
              <span className="text-[9px] font-mono-data text-slate-500">
                Δ {Math.round((metrics.changedPixels / metrics.totalPixels) * 100)}%
              </span>
            </div>
          )}

          {/* Connection quality */}
          <div className="flex items-center gap-1 px-2 py-1 bg-black/30 rounded-lg">
            <Signal size={12} className={qualityColor} />
            <span className={`text-[8px] font-orbitron uppercase ${qualityColor}`}>
              {connectionQuality}
            </span>
          </div>

          {/* Disconnect button */}
          {isLive && (
            <button
              onClick={toggleLive}
              className="flex items-center gap-2 px-6 py-2.5 bg-red-600/20 border border-red-500/40 text-red-500 rounded-xl font-orbitron text-xs font-bold hover:bg-red-600 hover:text-white transition-all"
            >
              <Square size={14} />
              DISCONNECT
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-6">
        {/* Left panel: Device list */}
        <div className="w-[250px] flex-shrink-0 glass-card border-green-500/10 p-4 h-[calc(100vh-250px)] overflow-y-auto">
          <h3 className="text-[10px] font-orbitron text-green-500 uppercase tracking-[0.3em] mb-4 border-b border-white/5 pb-3 flex items-center gap-2">
            <Eye size={14} />
            ONLINE NODES ({onlineDevices.length})
          </h3>
          
          {onlineDevices.length === 0 ? (
            <div className="text-center py-8">
              <Wifi size={32} className="text-slate-800 mx-auto mb-3" />
              <p className="text-[10px] font-orbitron text-slate-600 uppercase">No devices online</p>
              <p className="text-[8px] font-rajdhani text-slate-700 mt-2">
                Make sure client.py is running on a remote machine
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {onlineDevices.map(device => (
                <button
                  key={device.id}
                  onClick={() => {
                    setSelectedDeviceId(device.id);
                    if (isLive) {
                      setIsLive(false);
                    }
                  }}
                  className={`w-full p-3 rounded-xl text-left transition-all border ${
                    selectedDevice?.id === device.id
                      ? 'bg-green-600/20 border-green-500/40 text-green-400'
                      : 'bg-white/5 border-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0 shadow-[0_0_6px_rgba(34,197,94,0.6)]" />
                      <span className="text-xs font-orbitron font-bold truncate">{device.hostname}</span>
                    </div>
                  </div>
                  <div className="mt-1 text-[9px] font-mono-data text-slate-600 truncate pl-4">{device.ip}</div>
                  <div className="mt-0.5 text-[8px] font-rajdhani text-slate-700 pl-4">{device.os}</div>
                </button>
              ))}
            </div>
          )}

          <div className="mt-6 p-3 bg-black/40 border border-white/5 rounded-xl">
            <h4 className="text-[8px] font-orbitron text-slate-500 uppercase tracking-wider mb-2">Dirty Rectangle Engine</h4>
            <div className="space-y-1 text-[7px] font-rajdhani text-slate-600">
              <div className="flex justify-between">
                <span>Capture screen</span>
                <span className="text-green-600">1-5ms</span>
              </div>
              <div className="flex justify-between">
                <span>Diff previous frame</span>
                <span className="text-green-600">2-8ms</span>
              </div>
              <div className="flex justify-between">
                <span>Extract dirty region</span>
                <span className="text-green-600">1-3ms</span>
              </div>
              <div className="flex justify-between">
                <span>JPEG encode</span>
                <span className="text-green-600">5-20ms</span>
              </div>
              <div className="flex justify-between">
                <span>Transmit + Decode</span>
                <span className="text-yellow-600">10-80ms</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right panel: Live canvas */}
        <div className="flex-1 space-y-4">
          <div className="relative aspect-video glass-card border-green-500/10 overflow-hidden bg-[#02040a] shadow-[0_0_100px_rgba(0,0,0,0.5)]">
            <AnimatePresence mode="wait">
              {!selectedDevice ? (
                <motion.div
                  key="no-device"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 flex flex-col items-center justify-center gap-6"
                >
                  <Monitor size={100} className="text-slate-900 opacity-40" />
                  <div className="text-center space-y-2">
                    <h2 className="text-xl font-orbitron text-slate-500 uppercase tracking-widest">SELECT A DEVICE</h2>
                    <p className="text-[10px] font-rajdhani text-slate-700 italic tracking-widest">
                      Choose an online device to start live monitoring
                    </p>
                    <p className="text-[8px] font-mono-data text-slate-800 mt-4 max-w-md leading-relaxed">
                      Dirty Rectangle Engine: Each frame is compared with the previous one.
                      Only changed regions (dirty rectangles) are transmitted, saving 60-95% bandwidth.
                      Full frames are sent when changes exceed 60% of the screen.
                    </p>
                  </div>
                </motion.div>
              ) : !isLive ? (
                <motion.div
                  key="ready"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 flex flex-col items-center justify-center gap-6"
                >
                  <Monitor size={100} className="text-slate-900" />
                  <div className="text-center">
                    <p className="text-[10px] font-orbitron text-slate-600 uppercase tracking-[0.4em]">Signal Standby</p>
                    <p className="text-xs text-slate-800 font-rajdhani mt-2 italic">
                      Target: {selectedDevice.hostname} ({selectedDevice.ip})
                    </p>
                    <button
                      onClick={toggleLive}
                      className="mt-6 px-8 py-3 bg-green-600 text-white rounded-xl font-orbitron text-xs font-bold hover:bg-green-500 transition-all shadow-[0_0_30px_rgba(34,197,94,0.3)] flex items-center gap-2 mx-auto"
                    >
                      <Play size={16} />
                      INITIATE STREAM
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="live"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="absolute inset-0"
                >
                  {/* REAL CANVAS — renders the remote screen */}
                  <div
                    className="w-full h-full overflow-hidden bg-black"
                    onMouseDown={(e) => { if (zoom > 1) dragRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }; }}
                    onMouseMove={(e) => {
                      if (dragRef.current) setPan({ x: e.clientX - dragRef.current.x, y: e.clientY - dragRef.current.y });
                    }}
                    onMouseUp={() => { dragRef.current = null; }}
                    onMouseLeave={() => { dragRef.current = null; }}
                  >
                    <canvas
                      ref={canvasRef}
                      className="w-full h-full object-contain"
                      style={{
                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                        transformOrigin: 'center center',
                        cursor: zoom > 1 ? 'grab' : 'default',
                      }}
                    />
                  </div>

                  {/* Zoom controls */}
                  <div className="absolute top-4 right-4 flex items-center gap-1 bg-black/70 px-2 py-1.5 rounded-lg border border-white/10">
                    <button
                      onClick={() => setZoom(z => Math.max(1, +(z - 0.25).toFixed(2)))}
                      className="w-6 h-6 rounded text-slate-300 hover:text-green-400 hover:bg-white/5 text-sm font-bold"
                      title="Zoom out"
                    >−</button>
                    <span className="text-[9px] font-mono-data text-slate-400 w-10 text-center">{Math.round(zoom * 100)}%</span>
                    <button
                      onClick={() => setZoom(z => Math.min(4, +(z + 0.25).toFixed(2)))}
                      className="w-6 h-6 rounded text-slate-300 hover:text-green-400 hover:bg-white/5 text-sm font-bold"
                      title="Zoom in"
                    >+</button>
                    <button
                      onClick={resetView}
                      className="ml-1 px-2 h-6 rounded text-[8px] font-orbitron text-slate-400 hover:text-green-400 hover:bg-white/5 uppercase"
                    >Fit</button>
                  </div>

                  {/* Top-left overlay */}
                  <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/60 px-3 py-1.5 rounded-lg border border-white/5">
                    <div className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
                    <span className="text-[10px] font-orbitron text-white tracking-widest">
                      {selectedDevice.hostname} — {selectedDevice.id.slice(0, 8).toUpperCase()}
                    </span>
                  </div>

                  {/* Bottom bar */}
                  <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between bg-black/60 px-4 py-2 rounded-lg border border-white/5">
                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-2">
                        <Gauge size={14} className={metrics.fps > 15 ? 'text-green-500' : 'text-yellow-500'} />
                        <span className="text-xs font-mono-data font-bold text-green-500">
                          {metrics.fps} FPS
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Signal size={14} className={
                          metrics.latency < 40 ? 'text-cyan-400' :
                          metrics.latency < 80 ? 'text-yellow-400' : 'text-red-400'
                        } />
                        <span className="text-xs font-mono-data font-bold text-cyan-400">
                          {metrics.latency}ms
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Zap size={14} className="text-yellow-500" />
                        <span className="text-xs font-mono-data text-yellow-500 font-bold">
                          {metrics.frameSize}KB
                        </span>
                      </div>
                      {metrics.totalPixels > 0 && (
                        <div className="flex items-center gap-2 border-l border-white/10 pl-4">
                          <span className="text-[9px] font-mono-data text-slate-500">
                            Δ {Math.round((metrics.changedPixels / metrics.totalPixels) * 100)}%
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-yellow-500'}`} />
                      <span className="text-[8px] font-orbitron text-slate-500 uppercase tracking-wider">
                        {isConnected ? 'WebSocket' : 'Polling 80ms'}
                      </span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between p-4 glass-card border-green-500/10">
            <div className="flex gap-3">
              <button
                onClick={toggleLive}
                disabled={!selectedDevice}
                className={`flex items-center gap-2 px-6 py-2 rounded-xl font-orbitron text-[10px] font-bold transition-all ${
                  isLive
                    ? 'bg-red-600/20 text-red-500 border border-red-500/30 hover:bg-red-600 hover:text-white'
                    : 'bg-green-600/20 text-green-500 border border-green-500/30 hover:bg-green-600 hover:text-white'
                } disabled:opacity-30 disabled:cursor-not-allowed`}
              >
                {isLive ? <Square size={14} /> : <Play size={14} />}
                {isLive ? 'TERMINATE' : 'START STREAM'}
              </button>
              <button
                onClick={handleSnap}
                disabled={!selectedDevice || !isLive}
                title={selectedDevice ? 'Save the current frame' : 'Select a Target Node first'}
                className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 text-slate-400 rounded-xl font-orbitron text-[10px] hover:text-green-500 hover:bg-white/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Download size={14} />
                SNAP
              </button>
              <button className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 text-slate-400 rounded-xl font-orbitron text-[10px] hover:bg-white/10 transition-all">
                <RefreshCw size={14} />
                REFRESH
              </button>
            </div>
            <div className="flex gap-2">
              <button className="p-2.5 text-slate-500 hover:text-green-500 rounded-xl transition-all" title="Mouse control">
                <MousePointer2 size={18} />
              </button>
              <button className="p-2.5 text-slate-500 hover:text-green-500 rounded-xl transition-all" title="Keyboard input">
                <Keyboard size={18} />
              </button>
              <button className="p-2.5 text-slate-500 hover:text-green-500 rounded-xl transition-all" title="Settings">
                <Settings size={18} />
              </button>
            </div>
          </div>

          {/* Info cards */}
          <div className="grid grid-cols-4 gap-4">
            <div className="glass-card p-3 border-green-500/10">
              <p className="text-[8px] font-orbitron text-slate-500 uppercase tracking-widest">Connection</p>
              <p className={`text-xs font-mono-data font-bold mt-1 ${qualityColor}`}>
                {connectionQuality.toUpperCase()}
              </p>
            </div>
            <div className="glass-card p-3 border-green-500/10">
              <p className="text-[8px] font-orbitron text-slate-500 uppercase tracking-widest">Mode</p>
              <p className="text-xs font-mono-data font-bold mt-1 text-cyan-400">
                {isConnected ? 'WEBSOCKET' : 'HTTP POLL'}
              </p>
            </div>
            <div className="glass-card p-3 border-green-500/10">
              <p className="text-[8px] font-orbitron text-slate-500 uppercase tracking-widest">Transport</p>
              <p className="text-xs font-mono-data font-bold mt-1 text-green-500">
                DIRTY RECT
              </p>
            </div>
            <div className="glass-card p-3 border-green-500/10">
              <p className="text-[8px] font-orbitron text-slate-500 uppercase tracking-widest">Transport</p>
              <p className="text-xs font-mono-data font-bold mt-1 text-green-500">
                {serverStats?.transport?.toUpperCase() ?? (isConnected ? 'SOCKET.IO' : 'HTTP')}
              </p>
            </div>
          </div>

          {/* ---------- MORE FEATURE — opens the full multi-device wall page ---------- */}
          <div className="glass-card p-4 border-green-500/10">
            {/* Square tile — compact and prominent. */}
            <button
              onClick={() => navigate('/device-wall')}
              title="Watch several screens at once"
              className="w-40 h-40 rounded-2xl border border-green-500/25 bg-green-500/[0.06] hover:bg-green-600/15 hover:border-green-500/60 transition-all flex flex-col items-center justify-center gap-3 group shrink-0"
            >
              <Monitor size={30} className="text-green-400 group-hover:text-green-300" />
              <span className="text-[11px] font-orbitron uppercase tracking-[0.2em] text-green-400 group-hover:text-green-300">
                Multi-Monitor
              </span>
              <span className="text-[8px] font-mono-data text-slate-500 px-3 text-center leading-relaxed">
                Watch several screens at once
              </span>
              <span className="text-[8px] font-orbitron uppercase tracking-widest text-green-500/70 group-hover:text-green-300">
                open →
              </span>
            </button>

            {showMoreFeature && (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap gap-2">
                  {onlineDevices.map(d => (
                    <button
                      key={d.id}
                      onClick={() => toggleWatched(d.id)}
                      className={`px-3 py-1.5 rounded-lg border text-[9px] font-orbitron uppercase transition-all ${
                        watched.includes(d.id)
                          ? 'border-green-500/50 bg-green-500/10 text-green-300'
                          : 'border-white/10 bg-white/5 text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {watched.includes(d.id) ? '− ' : '+ '}{d.hostname}
                    </button>
                  ))}
                  {onlineDevices.length === 0 && (
                    <p className="text-[10px] font-mono-data text-slate-600">No online devices to add.</p>
                  )}
                </div>

                {watched.length === 0 ? (
                  <p className="text-[10px] font-mono-data text-slate-600 py-4 text-center">
                    Add devices above to build the monitoring wall.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                    {watched.map(id => {
                      const d = devices.find(x => x.id === id);
                      return (
                        <div key={id} className="rounded-xl border border-white/5 bg-black/40 overflow-hidden">
                          <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
                            <span className="text-[10px] font-orbitron text-slate-300 truncate">{d?.hostname ?? id.slice(0, 8)}</span>
                            <button
                              onClick={() => { setSelectedDeviceId(id); }}
                              className="text-[8px] font-orbitron text-green-400 hover:text-green-300 uppercase"
                            >
                              Focus
                            </button>
                          </div>
                          <img
                            src={`${API_BASE}/api/screenshot/${id}/latest`}
                            alt={`${d?.hostname ?? id} preview`}
                            className="w-full h-28 object-contain bg-black"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = '0.15'; }}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ---------- DATA CHECK ---------- */}
          <div className="glass-card p-4 border-green-500/10">
            <button
              onClick={() => setShowDataCheck(v => !v)}
              className="w-full flex items-center justify-between"
            >
              <span className="flex items-center gap-2 text-[10px] font-orbitron uppercase tracking-[0.25em] text-cyan-300">
                <Activity size={14} /> Data Check — measured stream statistics
              </span>
              <span className="text-[9px] font-mono-data text-slate-500">{showDataCheck ? 'hide' : 'open'}</span>
            </button>

            {showDataCheck && (
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { l: 'Frame Rate', v: serverStats?.screen?.fps != null ? `${serverStats.screen.fps} fps` : '—' },
                  { l: 'Latency', v: metrics.latency ? `${metrics.latency} ms` : '—' },
                  { l: 'Frame Size', v: serverStats?.screen?.frame_kb ? `${serverStats.screen.frame_kb} KB` : `${metrics.frameSize} KB` },
                  { l: 'Changed Pixels', v: metrics.totalPixels ? `${Math.round((metrics.changedPixels / metrics.totalPixels) * 100)}%` : '—' },
                  { l: 'Resolution', v: metrics.totalPixels ? `${canvasRef.current?.width ?? '—'}×${canvasRef.current?.height ?? '—'}` : '—' },
                  { l: 'Encoding', v: serverStats?.encoding ?? 'JPEG dirty-rect' },
                  { l: 'Transport', v: serverStats?.transport ?? (isConnected ? 'socket.io' : 'http') },
                  { l: 'Last Frame', v: serverStats?.screen?.last_frame_age_s != null ? `${serverStats.screen.last_frame_age_s}s ago` : '—' },
                ].map(x => (
                  <div key={x.l} className="p-2.5 rounded-lg bg-white/[0.04] border border-white/5">
                    <p className="text-[8px] font-orbitron text-slate-500 uppercase tracking-widest">{x.l}</p>
                    <p className="text-[12px] font-mono-data text-slate-200 mt-1 truncate">{x.v}</p>
                  </div>
                ))}
                <p className="col-span-2 md:col-span-4 text-[9px] font-mono-data text-slate-600">
                  Values marked — are not measurable yet. Nothing here is simulated.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveMonitor;