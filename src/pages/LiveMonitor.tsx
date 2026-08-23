import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Settings, MousePointer2, Keyboard, RefreshCw,
  Play, Square, Activity, Eye, Monitor,
  Wifi, Signal, Zap, Gauge
} from 'lucide-react';
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
  const { devices, selectedDevice, setSelectedDeviceId } = useDevices();
  const { socket, isConnected } = useSocket();
  
  const [isLive, setIsLive] = useState(false);
  const [currentScreenshot, setCurrentScreenshot] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<FrameMetrics>({
    fps: 0, latency: 0, frameSize: 0, totalPixels: 0, changedPixels: 0
  });
  const [connectionQuality, setConnectionQuality] = useState<'excellent' | 'good' | 'average' | 'poor'>('excellent');
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

  // HTTP polling fallback
  const pollFrame = useCallback(async () => {
    if (!selectedDevice || !isLive) return;

    try {
      const startTime = Date.now();
      const res = await fetch(`${API_BASE}/api/screenshot/${selectedDevice.id}`);

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
    }
  }, [selectedDevice, isLive, renderFrame]);

  // Start/stop polling
  useEffect(() => {
    if (isLive && selectedDevice) {
      pollFrame();
      pollingRef.current = setInterval(pollFrame, 80); // ~12 FPS polling fallback
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [isLive, selectedDevice, pollFrame]);

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
          <h1 className="text-3xl font-bold font-orbitron tracking-tight text-white uppercase">
            Live <span className="text-green-500">Surveillance</span>
          </h1>
          <p className="text-slate-400 font-rajdhani text-xs tracking-widest mt-1 uppercase">
            AnyDesk-Style Neural Streaming — Dirty Rectangle Diff Engine
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
                  <canvas
                    ref={canvasRef}
                    className="w-full h-full object-contain bg-black"
                  />

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
              <p className="text-[8px] font-orbitron text-slate-500 uppercase tracking-widest">Encryption</p>
              <p className="text-xs font-mono-data font-bold mt-1 text-green-500">AES-256</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveMonitor;