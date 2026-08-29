import { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, CameraOff, Video, RefreshCw, Download, Settings, Shield, Sun } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDevices } from '../context/DeviceContext';
import { useSocket } from '../context/SocketContext';
import { API_BASE } from '../utils/api';
import { notifySystem } from '../utils/notify';

const Webcam = () => {
  const { devices, selectedDevice, setSelectedDeviceId } = useDevices();
  const { socket, isConnected } = useSocket();
  const [isActive, setIsActive] = useState(false);
  const [currentFrame, setCurrentFrame] = useState<string | null>(null);
  const [isFrontCamera, setIsFrontCamera] = useState(true);
  const [fps, setFps] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [streamQuality, setStreamQuality] = useState<'smooth' | 'balanced' | 'quality'>('balanced');
  const [canvasSize, setCanvasSize] = useState({ w: 640, h: 480 });
  const [showMoreFeature, setShowMoreFeature] = useState(false);
  const [watched, setWatched] = useState<string[]>([]);

  const frameCountRef = useRef(0);
  const lastFpsTimeRef = useRef(Date.now());
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const pendingFrameRef = useRef<string | null>(null);

  const onlineDevices = devices.filter(d => d.status === 'online');
  const canStream = Boolean(selectedDevice && isActive);

  // SocketIO listener
  useEffect(() => {
    if (!socket || !canStream) return;

    const handleFrame = (data: { device_id: string; image: string; timestamp: string }) => {
      if (data.device_id === selectedDevice!.id) {
        pendingFrameRef.current = `data:image/jpeg;base64,${data.image}`;
        setCurrentFrame(pendingFrameRef.current);

        frameCountRef.current++;
        const now = Date.now();
        if (now - lastFpsTimeRef.current >= 1000) {
          setFps(frameCountRef.current);
          frameCountRef.current = 0;
          lastFpsTimeRef.current = now;
        }
      }
    };

    socket.on('webcam_frame', handleFrame);
    return () => { socket.off('webcam_frame', handleFrame); };
  }, [socket, canStream, selectedDevice]);

  // Polling is a FALLBACK only. The server already pushes every webcam frame
  // over Socket.IO (`webcam_frame`), so polling on top of it doubles the load
  // and caps the frame rate - the same bug that was fixed in Live Monitor.
  const inFlightRef = useRef(false);

  const pollFrame = useCallback(async () => {
    if (!selectedDevice || !isActive) return;
    if (inFlightRef.current) return;   // never stack overlapping requests
    inFlightRef.current = true;
    try {
      const res = await fetch(`${API_BASE}/api/webcam/${selectedDevice.id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.image) {
          setCurrentFrame(`data:image/jpeg;base64,${data.image}`);
          frameCountRef.current++;
          const now = Date.now();
          if (now - lastFpsTimeRef.current >= 1000) {
            setFps(frameCountRef.current);
            frameCountRef.current = 0;
            lastFpsTimeRef.current = now;
          }
        }
      }
    } catch {
      /* keep last frame */
    } finally {
      inFlightRef.current = false;
    }
  }, [selectedDevice, isActive]);

  // Polling interval - skipped entirely while the socket is delivering frames.
  useEffect(() => {
    if (!canStream || isConnected) {
      if (pollingRef.current) clearInterval(pollingRef.current);
      pollingRef.current = null;
      return;
    }
    const intervals = {
      smooth: 33,   // ~30 FPS ceiling for HTTP polling
      balanced: 40,
      quality: 50,
    };
    const ms = intervals[streamQuality];
    pollFrame();
    pollingRef.current = setInterval(pollFrame, ms);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [canStream, pollFrame, streamQuality, isConnected]);

  const handleToggle = () => {
    if (!selectedDevice) {
      notifySystem('error', 'No device selected');
      return;
    }
    const newState = !isActive;
    setIsActive(newState);

    if (newState) {
      frameCountRef.current = 0;
      lastFpsTimeRef.current = Date.now();
      setCurrentFrame(null);
      fetch(`${API_BASE}/api/webcam/${selectedDevice.id}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          camera: isFrontCamera ? 'front' : 'back',
          interval: { smooth: 16, balanced: 20, quality: 33 }[streamQuality],
        }),
      }).catch(() => {});
      notifySystem('connection', `Webcam started: ${selectedDevice.hostname}`);
    } else {
      fetch(`${API_BASE}/api/webcam/${selectedDevice.id}/stop`, { method: 'POST' }).catch(() => {});
      setCurrentFrame(null);
      setFps(0);
      notifySystem('security', 'Stream terminated');
    }
  };

  const handleSnap = () => {
    if (!selectedDevice || !currentFrame) return;
    const link = document.createElement('a');
    link.href = currentFrame;
    link.download = `${selectedDevice.hostname}_${isFrontCamera ? 'FRONT' : 'BACK'}_${Date.now()}.jpg`;
    link.click();
    notifySystem('download', `Snapshot saved`);
  };

  const startRecording = () => {
    if (!currentFrame) return;
    const c = document.createElement('canvas');
    c.width = 640; c.height = 480;
    const ctx = c.getContext('2d')!;
    setIsRecording(true);
    setRecordedChunks([]);

    const stream = c.captureStream(10);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
    recorder.ondataavailable = (e) => { if (e.data.size > 0) setRecordedChunks(p => [...p, e.data]); };
    recorder.onstop = () => {
      setRecordedChunks(prev => {
        if (prev.length) {
          const blob = new Blob(prev, { type: 'video/webm' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${selectedDevice!.hostname}_REC_${Date.now()}.webm`;
          a.click();
          URL.revokeObjectURL(url);
        }
        return [];
      });
      setIsRecording(false);
    };
    mediaRecorderRef.current = recorder;
    recorder.start(1000);

    const drawInterval = setInterval(() => {
      if (!currentFrame) return;
      const img = new Image();
      img.onload = () => { ctx.drawImage(img, 0, 0, 640, 480); };
      img.src = currentFrame;
    }, 100);
    (recorder as any)._drawInterval = drawInterval;
    notifySystem('info', 'Recording started');
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      clearInterval((mediaRecorderRef.current as any)._drawInterval);
      mediaRecorderRef.current.stop();
    }
  };

  const switchCamera = () => {
    setIsFrontCamera(p => !p);
    if (selectedDevice && isActive) {
      fetch(`${API_BASE}/api/webcam/${selectedDevice.id}/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ camera: !isFrontCamera ? 'front' : 'back' }),
      }).catch(() => {});
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 p-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-orbitron tracking-tight text-white uppercase">
            Webcam <span className="text-green-500">Surveillance</span>
          </h1>
          <p className="text-slate-400 font-rajdhani text-xs tracking-widest mt-1 uppercase">
            Remote Camera — Light → Sensor → Encode → Transmit → Display
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <select
            className="bg-black/40 border border-green-500/30 text-green-400 px-3 py-1.5 rounded-xl text-xs font-orbitron"
            value={selectedDevice?.id || ''}
            onChange={(e) => {
              if (isActive) { setIsActive(false); setCurrentFrame(null); setFps(0); }
              setSelectedDeviceId(e.target.value || null);
            }}
          >
            <option value="">SELECT DEVICE</option>
            {onlineDevices.map(d => (
              <option key={d.id} value={d.id}>{d.hostname} ({d.ip})</option>
            ))}
          </select>

          {isActive && (
            <select
              className="bg-black/40 border border-green-500/30 text-green-400 px-2 py-1.5 rounded-xl text-[9px] font-orbitron"
              value={streamQuality}
              onChange={e => setStreamQuality(e.target.value as any)}
            >
              <option value="smooth">SMOOTH (60 FPS)</option>
              <option value="balanced">BALANCED (50 FPS)</option>
              <option value="quality">LOW LOAD (30 FPS)</option>
            </select>
          )}

          <div className="px-3 py-1.5 bg-black/40 border border-green-500/10 rounded-xl flex items-center gap-2">
            <Camera size={12} className={isActive ? 'text-green-500' : 'text-slate-600'} />
            <span className={`text-xs font-mono-data font-bold ${isActive ? 'text-green-500' : 'text-slate-600'}`}>
              {isActive ? `${fps} FPS` : '--'}
            </span>
          </div>

          <div className={`px-4 py-1.5 rounded-lg flex items-center gap-2 border ${
            isRecording ? 'bg-red-500/20 border-red-500/40' : 'bg-black/40 border-white/5'
          }`}>
            <div className={`w-2 h-2 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-slate-600'}`} />
            <span className={`text-[10px] font-mono-data uppercase ${isRecording ? 'text-red-400' : 'text-slate-500'}`}>
              {isRecording ? 'REC' : 'STBY'}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="relative aspect-video glass-card border-green-500/10 overflow-hidden bg-black shadow-[0_0_50px_rgba(0,0,0,0.5)]">
            <AnimatePresence mode="wait">
              {canStream && currentFrame ? (
                <motion.div key="streaming" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full h-full relative">
                  <img src={currentFrame} className="w-full h-full object-contain" alt="Webcam Stream" />

                  <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/70 px-3 py-1.5 rounded-lg border border-white/10">
                    <div className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
                    <span className="text-[10px] font-orbitron text-white tracking-widest">
                      {selectedDevice?.hostname} — {isFrontCamera ? 'FRONT' : 'BACK'} CAM
                    </span>
                  </div>

                  <div className="absolute top-4 right-4 bg-black/70 px-3 py-1.5 rounded-lg border border-white/10">
                    <span className="text-[8px] font-mono-data text-slate-400">
                      {fps} FPS | {streamQuality.toUpperCase()}
                    </span>
                  </div>

                  <div className="absolute bottom-4 left-4 right-4 bg-black/70 px-4 py-2 rounded-lg border border-white/10">
                    <div className="flex items-center justify-between text-[8px] font-mono-data text-slate-500">
                      <div className="flex items-center gap-4">
                        <span className="flex items-center gap-1"><Sun size={10} className="text-yellow-500" /> Streaming</span>
                        <span>{isFrontCamera ? 'Front' : 'Back'} camera</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Camera size={10} className="text-green-500" />
                        <span className="text-green-500 font-bold">{fps} FPS</span>
                        <span className="text-slate-600">|</span>
                        <span className="text-slate-500">{isConnected ? 'WS' : 'HTTP'}</span>
                      </div>
                    </div>
                  </div>

                  {isRecording && (
                    <div className="absolute top-4 right-28 flex items-center gap-2 bg-red-600/30 px-3 py-1.5 rounded-lg border border-red-500/50">
                      <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-[9px] font-orbitron text-red-400 tracking-widest">REC</span>
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 flex flex-col items-center justify-center gap-6">
                  {canStream && !currentFrame ? (
                    <div className="text-center">
                      <RefreshCw size={48} className="text-slate-800 animate-spin mx-auto mb-4" />
                      <p className="text-[10px] font-orbitron text-slate-600 uppercase tracking-widest">Waiting for first frame...</p>
                      <p className="text-[9px] font-rajdhani text-slate-800 mt-2">Client target interval { {smooth: '16ms / 60 FPS', balanced: '20ms / 50 FPS', quality: '33ms / 30 FPS'}[streamQuality] }</p>
                    </div>
                  ) : !selectedDevice ? (
                    <div className="text-center">
                      <CameraOff size={64} className="text-slate-900 mx-auto mb-4" />
                      <h2 className="text-lg font-orbitron text-slate-500 uppercase tracking-widest">SELECT A DEVICE</h2>
                      <p className="text-[10px] font-rajdhani text-slate-700 mt-2">Choose an online device and start the stream</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <Camera size={64} className="text-slate-900 mx-auto mb-4" />
                      <p className="text-[10px] font-orbitron text-slate-600 uppercase tracking-widest">{selectedDevice.hostname} selected</p>
                      <p className="text-[9px] text-slate-700 mt-1">Click camera button below to start</p>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex gap-4 z-20">
              <button onClick={handleToggle} disabled={!selectedDevice}
                className={`p-4 rounded-full transition-all shadow-2xl ${
                  isActive
                    ? 'bg-red-600 text-white hover:bg-red-500 shadow-[0_0_20px_rgba(220,38,38,0.4)]'
                    : 'bg-green-600 text-white hover:bg-green-500 shadow-[0_0_20px_rgba(34,197,94,0.4)]'
                } disabled:opacity-30`}>
                {isActive ? <CameraOff size={22} /> : <Camera size={22} />}
              </button>
              <button onClick={switchCamera} disabled={!selectedDevice}
                className="p-4 rounded-full bg-white/10 text-white hover:bg-white/20 transition-all disabled:opacity-30">
                <RefreshCw size={22} className={`transition-transform ${!isFrontCamera ? 'rotate-180' : ''}`} />
              </button>
              <button onClick={isRecording ? stopRecording : startRecording} disabled={!canStream}
                className={`p-4 rounded-full transition-all disabled:opacity-30 ${
                  isRecording
                    ? 'bg-red-700 text-white hover:bg-red-600 shadow-[0_0_20px_rgba(220,38,38,0.4)]'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}>
                <Video size={22} className={isRecording ? 'animate-pulse' : ''} />
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="glass-card p-6 border-green-500/10">
            <h3 className="text-[10px] font-orbitron text-green-500 mb-6 uppercase tracking-[0.3em] border-b border-white/5 pb-4 flex items-center gap-2">
              <Settings size={14} /> Camera Controls
            </h3>
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between text-[9px] font-mono-data uppercase">
                  <span className="text-slate-500">Camera</span>
                  <span className="text-green-500">{isFrontCamera ? 'FRONT' : 'BACK'}</span>
                </div>
                <button onClick={switchCamera} disabled={!selectedDevice}
                  className="w-full py-2 bg-white/5 border border-white/10 rounded-xl text-[10px] font-orbitron text-slate-400 hover:text-green-500 hover:border-green-500/30 transition-all disabled:opacity-30">
                  SWITCH CAMERA
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button onClick={isRecording ? stopRecording : startRecording} disabled={!canStream}
                  className={`flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-orbitron uppercase tracking-widest transition-all disabled:opacity-30 ${
                    isRecording
                      ? 'bg-red-600/20 border border-red-500/40 text-red-400'
                      : 'bg-white/5 border border-white/10 text-slate-400 hover:text-red-500'
                  }`}>
                  <Video size={14} className={isRecording ? 'animate-pulse' : ''} />
                  {isRecording ? 'STOP' : 'RECORD'}
                </button>
                <button onClick={handleSnap} disabled={!canStream || !currentFrame}
                  className="flex items-center justify-center gap-2 py-3 bg-white/5 border border-white/10 rounded-xl text-[10px] font-orbitron text-slate-400 hover:text-green-500 transition-all uppercase tracking-widest disabled:opacity-30">
                  <Download size={14} /> SNAP
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="glass-card p-4 border-green-500/10">
              <p className="text-[8px] font-orbitron text-slate-500 uppercase tracking-widest">Status</p>
              <p className={`text-xs font-mono-data font-bold mt-1 uppercase ${canStream ? 'text-green-500' : 'text-slate-600'}`}>
                {canStream ? 'STREAMING' : 'IDLE'}
              </p>
            </div>
            <div className="glass-card p-4 border-green-500/10">
              <p className="text-[8px] font-orbitron text-slate-500 uppercase tracking-widest">Transport</p>
              <p className="text-xs font-mono-data font-bold mt-1 text-cyan-400">
                {isConnected ? 'WEBSOCKET' : 'HTTP POLL'}
              </p>
            </div>
          </div>

          {/* MORE FEATURE — multi-camera wall */}
          <div className="glass-card p-4 border-green-500/10">
            <button onClick={() => setShowMoreFeature(v => !v)} className="w-full flex items-center justify-between">
              <span className="flex items-center gap-2 text-[10px] font-orbitron uppercase tracking-[0.25em] text-green-400">
                <Camera size={14} /> More Feature — Multi-Camera Wall
              </span>
              <span className="text-[9px] font-mono-data text-slate-500">
                {watched.length} watching · {showMoreFeature ? 'hide' : 'open'}
              </span>
            </button>

            {showMoreFeature && (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap gap-2">
                  {onlineDevices.map(d => (
                    <button
                      key={d.id}
                      onClick={() => setWatched(prev => prev.includes(d.id) ? prev.filter(x => x !== d.id) : [...prev, d.id])}
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
                    Add devices above to build the camera wall.
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
                              onClick={() => setSelectedDeviceId(id)}
                              className="text-[8px] font-orbitron text-green-400 hover:text-green-300 uppercase"
                            >
                              Focus
                            </button>
                          </div>
                          <img
                            src={`${API_BASE}/api/webcam/${id}/latest`}
                            alt={`${d?.hostname ?? id} camera`}
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

          <div className="glass-card p-6 border-green-500/10">
            <div className="flex items-start gap-4 p-3 bg-black/40 border border-white/5 rounded-xl">
              <Shield className="text-green-600 mt-1 flex-shrink-0" size={16} />
              <div className="text-[10px] font-rajdhani text-slate-500">
                <p className="font-bold text-slate-200 uppercase mb-1">Stream Pipeline</p>
                <p className="leading-relaxed text-[9px]">
                  Light → CMOS Sensor → JPEG Encode → 
                  {isConnected ? ' WebSocket ' : ' HTTP '} 
                  Transmit → Decode → Display
                </p>
                <p className="text-[8px] text-slate-600 mt-2">
                  Quality: {streamQuality} | Target: { {smooth: '60 FPS', balanced: '50 FPS', quality: '30 FPS'}[streamQuality] }
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Webcam;