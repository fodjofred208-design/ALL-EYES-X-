import { useState, useRef, useCallback, useEffect } from 'react';
import BackButton from '../components/BackButton';
import { usePolling } from '../hooks/usePolling';
import { Smartphone, Monitor, Zap, Wifi, Signal, RefreshCw, MousePointer2, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useDevices } from '../context/DeviceContext';
import { useSocket } from '../context/SocketContext';
import { API_BASE } from '../utils/api';

const TouchMonitor = () => {
  const navigate = useNavigate();
  const { devices, selectedDevice, setSelectedDeviceId } = useDevices();
  const { socket, isConnected } = useSocket();
  const [deviceType, setDeviceType] = useState<'phone' | 'pc'>('pc');
  const [isMirroring, setIsMirroring] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [touchPoint, setTouchPoint] = useState<{ x: number; y: number; isDown: boolean } | null>(null);
  const [remoteScreen, setRemoteScreen] = useState<string | null>(null);
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);
  const inFlightRef = useRef(false);
  const [zoom, setZoom] = useState(1);
  const [controlSession, setControlSession] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  const onlineDevices = devices.filter(d => d.status === 'online');

  // SocketIO listener for touch screens
  useEffect(() => {
    if (!socket || !selectedDevice || !isMirroring) return;

    const handleFrame = (data: { device_id: string; image: string; timestamp: string }) => {
      if (data.device_id === selectedDevice.id) {
        setRemoteScreen(`data:image/jpeg;base64,${data.image}`);
      }
    };

    // The server pushes remote screens as 'screenshare_frame'. This listener
    // used to wait for 'touch_screen_frame', an event the backend never emits,
    // so the mirror only ever updated through the slow HTTP fallback.
    socket.on('screenshare_frame', handleFrame);
    return () => { socket.off('screenshare_frame', handleFrame); };
  }, [socket, selectedDevice, isMirroring]);

  // Polling for remote screen
  const pollScreen = useCallback(async () => {
    if (!selectedDevice || !isMirroring) return;
    if (inFlightRef.current) return;   // never stack overlapping requests
    inFlightRef.current = true;
    try {
      const res = await fetch(`${API_BASE}/api/screenshot/${selectedDevice.id}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.image) setRemoteScreen(`data:image/jpeg;base64,${data.image}`);
      }
    } catch {
      // Silent
    } finally {
      inFlightRef.current = false;
    }
  }, [selectedDevice, isMirroring]);

  // Fallback only, never on top of the socket push. usePolling also pauses while
  // the tab is hidden, so a backgrounded mirror stops pulling a full screenshot
  // ten times a second from a machine nobody is looking at.
  usePolling(pollScreen, 100, isMirroring && !!selectedDevice && !isConnected);

  // Get canvas-relative coordinates scaled to the remote screen
  const getScaledCoords = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !selectedDevice) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const relX = clientX - rect.left;
    const relY = clientY - rect.top;

    // Scale from canvas display size to virtual resolution
    const scaleX = (deviceType === 'phone' ? 360 : 1920) / rect.width;
    const scaleY = (deviceType === 'phone' ? 640 : 1080) / rect.height;

    return { x: Math.round(relX * scaleX), y: Math.round(relY * scaleY) };
  }, [selectedDevice, deviceType]);

  // Send touch/click event to the remote client
  const sendTouchEvent = useCallback((
    eventType: 'down' | 'move' | 'up',
    clientX: number,
    clientY: number
  ) => {
    if (!selectedDevice || !isMirroring) return;

    const coords = getScaledCoords(clientX, clientY);
    setCursorPos(coords);

    const payload = {
      device_id: selectedDevice.id,
      event: eventType,
      x: coords.x,
      y: coords.y,
      width: deviceType === 'phone' ? 360 : 1920,
      height: deviceType === 'phone' ? 640 : 1080,
    };

    if (socket && isConnected) {
      socket.emit('touch_event', payload);
    } else {
      fetch(`${API_BASE}/api/touch`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {});
    }

    if (eventType === 'down' || eventType === 'move') {
      setTouchPoint({ x: coords.x, y: coords.y, isDown: eventType === 'down' });
    } else {
      setTouchPoint(null);
    }
  }, [selectedDevice, socket, isConnected, isMirroring, getScaledCoords, deviceType]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!isMirroring || !selectedDevice) return;
    setIsDragging(true);
    sendTouchEvent('down', e.clientX, e.clientY);
  }, [isMirroring, selectedDevice, sendTouchEvent]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isMirroring || !selectedDevice) return;
    setCursorPos(getScaledCoords(e.clientX, e.clientY));
    if (isDragging) sendTouchEvent('move', e.clientX, e.clientY);
  }, [isMirroring, isDragging, selectedDevice, sendTouchEvent, getScaledCoords]);

  const handleMouseUp = useCallback(() => {
    if (!isMirroring || !selectedDevice) return;
    setIsDragging(false);
    sendTouchEvent('up', 0, 0);
  }, [isMirroring, selectedDevice, sendTouchEvent]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!isMirroring || !selectedDevice || !e.touches[0]) return;
    setIsDragging(true);
    sendTouchEvent('down', e.touches[0].clientX, e.touches[0].clientY);
  }, [isMirroring, selectedDevice, sendTouchEvent]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isMirroring || !isDragging || !selectedDevice || !e.touches[0]) return;
    sendTouchEvent('move', e.touches[0].clientX, e.touches[0].clientY);
  }, [isMirroring, isDragging, selectedDevice, sendTouchEvent]);

  const handleTouchEnd = useCallback(() => {
    if (!isMirroring || !selectedDevice) return;
    setIsDragging(false);
    sendTouchEvent('up', 0, 0);
  }, [isMirroring, selectedDevice, sendTouchEvent]);

  // Socket is the primary transport; polling only when the socket is down.
  // Polling on top of the socket doubles the load and caps the frame rate.
  /** Announce and take control. The remote user is notified, not asked. */
  const takeControl = async () => {
    if (!selectedDevice) return;
    setNotice('Announcing takeover…');
    try {
      const res = await fetch(`${API_BASE}/api/remote/takeover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ device_id: selectedDevice.id }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setControlSession(data.session_id);
        setNotice(`Control taken. ${selectedDevice.hostname} was notified.`);
      } else {
        setNotice(data.error || 'Takeover failed');
        setControlSession(null);
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Takeover failed');
      setControlSession(null);
    }
  };

  const releaseControl = async () => {
    if (!selectedDevice || !controlSession) return;
    try {
      await fetch(`${API_BASE}/api/remote/release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ device_id: selectedDevice.id, session_id: controlSession }),
      });
    } catch { /* best effort */ }
    setControlSession(null);
    setNotice('Control released.');
  };

  const toggleMirroring = () => {
    if (!selectedDevice) return;
    const newState = !isMirroring;
    setIsMirroring(newState);
    if (!newState) { setRemoteScreen(null); setTouchPoint(null); }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 p-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <BackButton />
          <h1 className="text-3xl font-bold font-orbitron tracking-tight text-white uppercase">
            Remote <span className="text-green-500">Touch</span>
          </h1>
          <p className="text-slate-400 font-rajdhani text-xs tracking-widest mt-1 uppercase">
            Full Remote Control — See the screen, click anywhere, drag, scroll
          </p>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <select
            className="bg-black/40 border border-green-500/30 text-green-400 px-3 py-1.5 rounded-xl text-xs font-orbitron"
            value={selectedDevice?.id || ''}
            onChange={(e) => {
              if (isMirroring) { setIsMirroring(false); setRemoteScreen(null); setTouchPoint(null); }
              setSelectedDeviceId(e.target.value || null);
            }}
          >
            <option value="">SELECT DEVICE</option>
            {onlineDevices.map(d => (
              <option key={d.id} value={d.id}>{d.hostname}</option>
            ))}
          </select>

          <button onClick={toggleMirroring} disabled={!selectedDevice}
            className={`px-4 py-2 rounded-xl text-xs font-orbitron font-bold transition-all flex items-center gap-2 ${
              isMirroring
                ? 'bg-green-600 text-white shadow-[0_0_15px_rgba(34,197,94,0.4)]'
                : 'bg-white/5 text-slate-400 border border-white/10 hover:text-white'
            } disabled:opacity-30`}>
            <Zap size={14} /> {isMirroring ? 'ACTIVE' : 'CONNECT'}
          </button>

          {/* Takeover: the remote user is NOTIFIED, not asked for consent. */}
          {controlSession ? (
            <button onClick={releaseControl}
              className="px-4 py-2 rounded-xl text-xs font-orbitron font-bold bg-red-600/20 text-red-400 border border-red-500/40 hover:bg-red-600 hover:text-white transition-all flex items-center gap-2">
              <RotateCcw size={14} /> RELEASE CONTROL
            </button>
          ) : (
            <button onClick={takeControl} disabled={!selectedDevice}
              className="px-4 py-2 rounded-xl text-xs font-orbitron font-bold bg-amber-600/20 text-amber-300 border border-amber-500/40 hover:bg-amber-600 hover:text-white transition-all flex items-center gap-2 disabled:opacity-30">
              <MousePointer2 size={14} /> TAKE CONTROL
            </button>
          )}

          <div className="flex items-center gap-1 bg-black/40 border border-white/5 p-1 rounded-xl">
            <button onClick={() => setDeviceType('phone')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-orbitron transition-all ${
                deviceType === 'phone'
                  ? 'bg-green-600 text-white shadow-[0_0_10px_rgba(34,197,94,0.3)]'
                  : 'text-slate-500 hover:text-white'
              }`}>
              <Smartphone size={14} /> PHONE
            </button>
            <button onClick={() => setDeviceType('pc')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-orbitron transition-all ${
                deviceType === 'pc'
                  ? 'bg-green-600 text-white shadow-[0_0_10px_rgba(34,197,94,0.3)]'
                  : 'text-slate-500 hover:text-white'
              }`}>
              <Monitor size={14} /> DESKTOP
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Left panel */}
        <div className="w-[250px] flex-shrink-0 glass-card border-green-500/10 p-4 h-[calc(100vh-250px)] overflow-y-auto">
          <h3 className="text-[10px] font-orbitron text-green-500 uppercase tracking-[0.3em] mb-4 border-b border-white/5 pb-3 flex items-center gap-2">
            <Smartphone size={14} /> REMOTE NODES ({onlineDevices.length})
          </h3>

          {onlineDevices.length === 0 ? (
            <div className="text-center py-8">
              <Wifi size={32} className="text-slate-800 mx-auto mb-3" />
              <p className="text-[10px] font-orbitron text-slate-600 uppercase">No devices online</p>
              <p className="text-[8px] font-rajdhani text-slate-700 mt-2">Run client.py on a remote machine</p>
            </div>
          ) : (
            <div className="space-y-2">
              {onlineDevices.map(device => (
                <button key={device.id}
                  onClick={() => {
                    if (isMirroring) { setIsMirroring(false); setRemoteScreen(null); setTouchPoint(null); }
                    setSelectedDeviceId(device.id);
                  }}
                  className={`w-full p-3 rounded-xl text-left transition-all border ${
                    selectedDevice?.id === device.id
                      ? 'bg-green-600/20 border-green-500/40 text-green-400'
                      : 'bg-white/5 border-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
                  }`}>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0 shadow-[0_0_6px_rgba(34,197,94,0.6)]" />
                    <span className="text-xs font-orbitron font-bold truncate">{device.hostname}</span>
                  </div>
                  <div className="mt-1 text-[9px] font-mono-data text-slate-600 truncate pl-4">{device.ip}</div>
                </button>
              ))}
            </div>
          )}

          <div className="mt-6 p-3 bg-black/40 border border-white/5 rounded-xl">
            <h4 className="text-[8px] font-orbitron text-slate-500 uppercase tracking-wider mb-2">Protocol</h4>
            <div className="space-y-1 text-[7px] font-rajdhani text-slate-600">
              <div className="flex justify-between"><span>Screen capture</span><span className="text-green-600">5-15ms</span></div>
              <div className="flex justify-between"><span>Compress JPEG</span><span className="text-green-600">5-20ms</span></div>
              <div className="flex justify-between"><span>Transmit</span><span className="text-yellow-600">10-80ms</span></div>
              <div className="flex justify-between"><span>Display + Touch</span><span className="text-green-600">1-5ms</span></div>
              <div className="flex justify-between"><span>Click inject</span><span className="text-green-600">1-10ms</span></div>
            </div>
          </div>
        </div>

        {/* Right panel: Real remote screen with touch overlay */}
        <div className="flex-1 flex flex-col items-center justify-center min-h-[700px]">
          <AnimatePresence mode="wait">
            {!selectedDevice ? (
              <motion.div key="no-device" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center gap-6">
                <Smartphone size={100} className="text-slate-900 opacity-40" />
                <div className="text-center">
                  <h2 className="text-xl font-orbitron text-slate-500 uppercase tracking-widest">SELECT A DEVICE</h2>
                  <p className="text-[10px] font-rajdhani text-slate-700 mt-2">Choose an online device to see and control its screen</p>
                </div>
              </motion.div>
            ) : (
              <motion.div key="canvas" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-4">
                {/* The REAL remote screen canvas */}
                <div ref={canvasRef}
                  className={`relative overflow-hidden cursor-crosshair ${
                    deviceType === 'phone'
                      ? 'w-[360px] h-[640px] rounded-[32px] border-[6px] border-[#1a1e2e]'
                      : 'w-[640px] h-[360px] rounded-2xl border-[6px] border-[#1a1e2e]'
                  } shadow-[0_0_50px_rgba(0,255,0,0.05)] bg-black`}
                  onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
                  onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>

                  {isMirroring && remoteScreen ? (
                    /* REAL remote screen — zoom is applied visually only, so the
                       coordinate mapping sent to the agent stays unchanged. */
                    <img
                      src={remoteScreen}
                      alt="Remote screen"
                      className="w-full h-full object-contain select-none"
                      style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
                      draggable={false}
                    />
                  ) : isMirroring && !remoteScreen ? (
                    <div className="w-full h-full flex items-center justify-center bg-black">
                      <RefreshCw size={32} className="text-slate-700 animate-spin mx-auto mb-3" />
                      <p className="text-[10px] font-orbitron text-slate-600">Waiting for screen...</p>
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-[#060812]">
                      <div className="text-center">
                        <Monitor size={48} className="text-slate-800 mx-auto mb-3" />
                        <p className="text-[9px] font-orbitron text-slate-700 uppercase tracking-widest">{selectedDevice.hostname}</p>
                        <p className="text-[8px] text-slate-800 mt-1">Click CONNECT to see and control</p>
                      </div>
                    </div>
                  )}

                  {/* Device overlay */}
                  <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/70 px-3 py-1.5 rounded-lg border border-white/10 z-10">
                    <div className={`w-2 h-2 rounded-full ${isMirroring ? 'bg-green-500 animate-pulse' : 'bg-slate-600'}`} />
                    <span className="text-[10px] font-orbitron text-white tracking-widest">{selectedDevice.hostname}</span>
                  </div>

                  {/* Touch/click indicator */}
                  {touchPoint && isMirroring && (
                    <>
                      <div className={`absolute pointer-events-none z-30 w-4 h-4 -ml-2 -mt-2 rounded-full border-2 ${
                        touchPoint.isDown ? 'bg-green-500/40 border-green-500' : 'border-green-500/70'
                      }`}
                        style={{ left: `${(touchPoint.x / (deviceType === 'phone' ? 360 : 1920)) * 100}%`,
                                top: `${(touchPoint.y / (deviceType === 'phone' ? 640 : 1080)) * 100}%` }} />
                      <div className="absolute pointer-events-none z-20 w-8 h-8 -ml-4 -mt-4 rounded-full border border-green-500/30 animate-ping"
                        style={{ left: `${(touchPoint.x / (deviceType === 'phone' ? 360 : 1920)) * 100}%`,
                                top: `${(touchPoint.y / (deviceType === 'phone' ? 640 : 1080)) * 100}%` }} />
                    </>
                  )}

                  {/* Cursor crosshair */}
                  {isMirroring && (
                    <div className="absolute pointer-events-none z-20"
                      style={{ left: `${(cursorPos.x / (deviceType === 'phone' ? 360 : 1920)) * 100}%`,
                              top: `${(cursorPos.y / (deviceType === 'phone' ? 640 : 1080)) * 100}%`,
                              transform: 'translate(-50%, -50%)' }}>
                      <MousePointer2 size={16} className="text-green-500 drop-shadow-[0_0_4px_rgba(34,197,94,0.8)]" />
                    </div>
                  )}

                  {/* Bottom bar */}
                  <div className="absolute bottom-4 left-4 right-4 bg-black/70 px-4 py-2 rounded-lg border border-white/10 z-10">
                    <div className="flex items-center justify-between text-[8px] font-mono-data text-slate-500">
                      <div className="flex items-center gap-4">
                        <span>{deviceType === 'phone' ? 'TOUCH MODE' : 'MOUSE MODE'}</span>
                        <span>{deviceType === 'phone' ? '360x640' : '1920x1080'}</span>
                        {touchPoint && <span>x:{touchPoint.x} y:{touchPoint.y}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <Signal size={10} className={isConnected ? 'text-green-500' : 'text-yellow-500'} />
                        <span>{isConnected ? 'WebSocket' : 'HTTP'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Status bar */}
                <div className="flex items-center gap-6 text-[9px] font-mono-data">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${isMirroring ? 'bg-green-500' : 'bg-slate-600'}`} />
                    <span className={isMirroring ? 'text-green-500' : 'text-slate-600'}>{isMirroring ? 'Mirroring' : 'Standby'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Signal size={12} className={isConnected ? 'text-green-500' : 'text-yellow-500'} />
                    <span className="text-slate-500">{isConnected ? 'WebSocket' : 'HTTP Poll (100ms)'}</span>
                  </div>
                  {isMirroring && (
                    <div className="flex items-center gap-2">
                      <RefreshCw size={10} className="text-green-500" />
                      <span className="text-green-500">Click to interact</span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Takeover notice */}
      {notice && (
        <div className={`px-4 py-2.5 rounded-xl border text-[10px] font-mono-data ${
          controlSession
            ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
            : 'border-white/10 bg-white/5 text-slate-400'
        }`}>
          {notice}
        </div>
      )}

      {/* Zoom */}
      <div className="glass-card p-3 border-green-500/10 flex items-center justify-between">
        <span className="text-[10px] font-orbitron uppercase tracking-[0.25em] text-slate-400">Zoom</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setZoom(z => Math.max(1, +(z - 0.25).toFixed(2)))}
            className="w-7 h-7 rounded-lg border border-white/10 text-slate-300 hover:text-green-400 hover:border-green-500/40 text-sm font-bold">−</button>
          <span className="text-[11px] font-mono-data text-green-400 w-12 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(4, +(z + 0.25).toFixed(2)))}
            className="w-7 h-7 rounded-lg border border-white/10 text-slate-300 hover:text-green-400 hover:border-green-500/40 text-sm font-bold">+</button>
          <button onClick={() => setZoom(1)}
            className="px-3 h-7 rounded-lg border border-white/10 text-[9px] font-orbitron text-slate-400 hover:text-green-400 uppercase">Fit</button>
        </div>
      </div>

      {/* MORE FEATURE — multi-device wall */}
      <div className="glass-card p-4 border-green-500/10">
        {/* Square tile — compact and prominent. */}
        <button
          onClick={() => navigate('/device-wall')}
          title="Control several devices at once"
          className="w-40 h-40 rounded-2xl border border-green-500/25 bg-green-500/[0.06] hover:bg-green-600/15 hover:border-green-500/60 transition-all flex flex-col items-center justify-center gap-3 group shrink-0"
        >
          <Monitor size={30} className="text-green-400 group-hover:text-green-300" />
          <span className="text-[11px] font-orbitron uppercase tracking-[0.2em] text-green-400 group-hover:text-green-300">
            Multi-Touch
          </span>
          <span className="text-[8px] font-mono-data text-slate-500 px-3 text-center leading-relaxed">
            Control several devices at once
          </span>
          <span className="text-[8px] font-orbitron uppercase tracking-widest text-green-500/70 group-hover:text-green-300">
            open →
          </span>
        </button>

        
      </div>
    </div>
  );
};

export default TouchMonitor;