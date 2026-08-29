import { useState, useEffect, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';
import { BellRing, X, Terminal, Download, Zap, ShieldAlert, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { API_BASE } from '../utils/api';
import { usePolling } from '../hooks/usePolling';
import { useSocket } from '../context/SocketContext';

interface SystemLog { id: string; type: string; message: string; timestamp: number | string }

const SEV_ICON: Record<string, ReactNode> = {
  connection: <Zap size={14} className="text-green-500" />,
  download: <Download size={14} className="text-blue-400" />,
  command: <Terminal size={14} className="text-purple-400" />,
  critical: <ShieldAlert size={14} className="text-red-500" />,
  warning: <ShieldAlert size={14} className="text-amber-400" />,
};
const DEFAULT_ICON = <ShieldAlert size={14} className="text-slate-400" />;

const toMillis = (value: number | string): number => {
  if (typeof value === 'number') return value < 1e12 ? value * 1000 : value;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

/** Render a log timestamp as a readable local time. Accepts unix seconds or ISO. */
const formatStamp = (value: number | string): string => {
  if (value == null || value === '') return '';
  let ms: number;
  if (typeof value === 'number') {
    // backend stores unix seconds; guard against an already-ms value
    ms = value < 1e12 ? value * 1000 : value;
  } else {
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) return String(value);
    ms = parsed;
  }
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString([], {
    month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
};

const NotificationCenter = () => {
  const { socket } = useSocket();
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [unread, setUnread] = useState(0);
  const [shake, setShake] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const firstLoadRef = useRef(true);


  
  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/notifications`, { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data)) return;

      // defensive mapping: type | category | severity, message | title
      const fresh: SystemLog[] = data
        .map((n: any, i: number) => ({
          id: String(n.id ?? n.timestamp ?? `${n.timestamp}-${i}`),
          type: String(n.type ?? n.category ?? n.severity ?? 'connection').toLowerCase(),
          message: String(n.message ?? n.title ?? ''),
          timestamp: (n.timestamp ?? n.created_at ?? Date.now() / 1000),
        }))
        .filter((l: SystemLog) => l.message.trim() !== '')
        .filter((l: SystemLog) => {
          // dedupe — stable id, never index-based (no duplicate React keys)
          if (seenRef.current.has(l.id)) return false;
          seenRef.current.add(l.id);
          return true;
        });

      if (fresh.length === 0) return;

      fresh.sort((a, b) => toMillis(b.timestamp) - toMillis(a.timestamp)); // newest first
      const isFirstLoad = firstLoadRef.current;
      firstLoadRef.current = false;

      setLogs(prev => [...fresh, ...prev].slice(0, 100));

      // first load = baseline (no fake 188 unread); only real new signals notify
      if (!isFirstLoad && !isOpen) {
        setUnread(u => u + fresh.length);
        setShake(true);
        setTimeout(() => setShake(false), 600);
        // TODO(future): play alert tone here
      }
    } catch {
      /* backend unreachable / offline — keep existing logs */
    }
  }, [isOpen]);

  // The server already emits 'new_notification' on every event. Subscribing
  // makes new events land immediately; the poll below is only a safety net for
  // anything missed while the socket was down. Polling pauses on hidden tabs.
  usePolling(fetchNotifications, 15000);

  useEffect(() => {
    if (!socket) return;
    const onNotification = (n: { type?: string; message?: string; timestamp?: number | string }) => {
      if (!n?.message) return;
      const entry: SystemLog = {
        id: `${n.timestamp ?? Date.now()}-${n.message.slice(0, 24)}`,
        type: String(n.type ?? 'info').toLowerCase(),
        message: String(n.message),
        timestamp: n.timestamp ?? Date.now() / 1000,
      };
      setLogs(prev => [entry, ...prev].slice(0, 100));
      if (!isOpen) {
        setUnread(u => u + 1);
        setShake(true);
        setTimeout(() => setShake(false), 600);
      }
    };
    socket.on('new_notification', onNotification);
    return () => { socket.off('new_notification', onNotification); };
  }, [socket, isOpen]);

  // open the panel from anywhere (Quick Actions → Notifications)
  useEffect(() => {
    const open = () => { setIsOpen(true); setUnread(0); setShake(false); };
    window.addEventListener('aeyes-open-notifications', open);
    return () => window.removeEventListener('aeyes-open-notifications', open);
  }, []);

  // newest entries sit at the top
  useEffect(() => {
    if (isOpen && scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [isOpen, logs]);

  // close on outside click / Escape
  useEffect(() => {
    if (!isOpen) return;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen]);

  const toggle = () => {
    const next = !isOpen;
    setIsOpen(next);
    if (next) setUnread(0); // opening the panel marks everything read
    setShake(false);
  };

  const icon = (t: string) => SEV_ICON[t] ?? DEFAULT_ICON;

  return (
    <div ref={panelRef} className="fixed bottom-8 right-8 z-999">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.92 }}
            transition={{ duration: 0.25 }}
            className="absolute bottom-20 right-0 w-80 md:w-96 glass-card border-green-500/20 overflow-hidden flex flex-col shadow-[0_0_50px_rgba(34,197,94,0.12)]"
          >
            <div className="p-3 bg-green-500/10 border-b border-green-500/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity size={14} className="text-green-500 animate-pulse" />
                <h3 className="text-[10px] font-orbitron text-white uppercase tracking-widest">System Logs</h3>
                {unread > 0 && <span className="aeyes-badge">{unread > 99 ? '99+' : unread}</span>}
              </div>
              <button
                onClick={() => setIsOpen(false)}
                aria-label="Close notifications"
                className="text-slate-500 hover:text-white transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div ref={scrollRef} className="max-h-[360px] overflow-y-auto p-3 space-y-2 bg-black/40">
              {logs.length === 0 ? (
                <p className="text-center py-8 text-[10px] font-orbitron text-slate-700 tracking-[0.3em] uppercase">No signals yet</p>
              ) : logs.map(l => (
                <motion.div
                  key={l.id}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3 }}
                  className="flex items-start gap-2 group"
                >
                  <div className="mt-0.5 shrink-0">{icon(l.type)}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] text-slate-400 leading-relaxed group-hover:text-green-300 transition-colors">{l.message}</p>
                    <p className="text-[8px] font-mono-data text-slate-600 mt-0.5 tabular-nums">
                      {formatStamp(l.timestamp)}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        onClick={toggle}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        aria-label="Open notifications"
        className={`relative p-4 rounded-full bg-green-600/10 border border-green-500/40 text-green-500 shadow-[0_0_20px_rgba(34,197,94,0.25)] backdrop-blur-md hover:bg-green-600 hover:text-white transition-all ${shake ? 'aeyes-shake' : ''}`}
      >
        <BellRing size={22} className={unread > 0 ? 'animate-pulse' : ''} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 border-2 border-[#060812] shadow-[0_0_10px_rgba(239,68,68,0.6)] flex items-center justify-center text-[9px] font-bold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </motion.button>
    </div>
  );
};

export default NotificationCenter;