import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MoreVertical, Terminal as TerminalIcon, Send, MessageSquare, X } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { useDevices } from '../context/DeviceContext';
import { API_BASE } from '../utils/api';

type Mode = 'main' | 'solo';

interface PaneResult {
  device_id: string;
  hostname: string;
  command_id?: string;
  lines: string[];
  busy: boolean;
}

const MultiShell: React.FC = () => {
  const { devices, selectedDeviceId, setSelectedDeviceId } = useDevices();
  const [mode, setMode] = useState<Mode>('main');
  const [menuOpen, setMenuOpen] = useState(false);
  const [command, setCommand] = useState('');
  const [mainLines, setMainLines] = useState<string[]>([
    'ALL EYES X — MULTI-SHELL',
    'Main Command: one command, every selected device, one pane per device.',
    'Solo Command: a different command per device.',
    '',
  ]);
  const [panes, setPanes] = useState<Record<string, PaneResult>>({});
  const [soloCommands, setSoloCommands] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [msgOpen, setMsgOpen] = useState(false);
  const [msgText, setMsgText] = useState('');
  const [sending, setSending] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const mainEndRef = useRef<HTMLDivElement>(null);

  const onlineDevices = devices.filter(d => d.status === 'online');

  // Close the ⋮ menu on outside click.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => {
    mainEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mainLines]);

  const ts = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const toggleDevice = (id: string) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const ensurePane = useCallback((id: string, hostname: string) => {
    setPanes(prev => prev[id] ? prev : {
      ...prev,
      [id]: { device_id: id, hostname, lines: [], busy: false },
    });
  }, []);

  const appendPane = (id: string, line: string) =>
    setPanes(prev => prev[id]
      ? { ...prev, [id]: { ...prev[id], lines: [...prev[id].lines, line].slice(-200) } }
      : prev);

  /** Pull the stored result for one queued command id. */
  const pollResult = useCallback(async (deviceId: string, commandId: string, attempts = 0) => {
    if (attempts > 40) {
      appendPane(deviceId, '[timeout] no result returned by the agent');
      setPanes(prev => prev[deviceId] ? { ...prev, [deviceId]: { ...prev[deviceId], busy: false } } : prev);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/command/results?device_id=${encodeURIComponent(deviceId)}&limit=20`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        const row = (data.results || []).find((r: any) => r.command_id === commandId);
        if (row && (row.completed_at || row.result)) {
          appendPane(deviceId, row.success ? '[success]' : '[failed]');
          (row.result || '(no output)').split('\n').forEach((l: string) => appendPane(deviceId, l));
          setPanes(prev => prev[deviceId] ? { ...prev, [deviceId]: { ...prev[deviceId], busy: false } } : prev);
          return;
        }
      }
    } catch { /* retry */ }
    setTimeout(() => pollResult(deviceId, commandId, attempts + 1), 1500);
  }, []);

  /** Send one command to one device and track it in that device's pane. */
  const runOn = useCallback(async (deviceId: string, hostname: string, cmd: string) => {
    ensurePane(deviceId, hostname);
    appendPane(deviceId, `> ${cmd}`);
    setPanes(prev => prev[deviceId] ? { ...prev, [deviceId]: { ...prev[deviceId], busy: true } } : prev);
    try {
      const res = await fetch(`${API_BASE}/api/command`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: deviceId, command: cmd }),
      });
      const data = await res.json();
      if (!res.ok) {
        appendPane(deviceId, `[error] ${data.error || res.status}`);
        setPanes(prev => prev[deviceId] ? { ...prev, [deviceId]: { ...prev[deviceId], busy: false } } : prev);
        return;
      }
      appendPane(deviceId, `queued ${String(data.command_id || '').slice(0, 8)}…`);
      pollResult(deviceId, data.command_id);
    } catch (e) {
      appendPane(deviceId, `[error] ${e instanceof Error ? e.message : 'request failed'}`);
      setPanes(prev => prev[deviceId] ? { ...prev, [deviceId]: { ...prev[deviceId], busy: false } } : prev);
    }
  }, [ensurePane, pollResult]);

  /** MAIN mode: one command fanned out to every selected device. */
  const runMain = async () => {
    const cmd = command.trim();
    if (!cmd) return;
    const targets = selected.length
      ? devices.filter(d => selected.includes(d.id))
      : onlineDevices;
    if (!targets.length) {
      setMainLines(p => [...p, `[${ts()}] no online device to target`]);
      return;
    }
    setCommand('');
    setMainLines(p => [...p, `[${ts()}] MAIN → ${targets.length} device(s): ${cmd}`]);
    for (const d of targets) await runOn(d.id, d.hostname, cmd);
  };

  /** SOLO mode: each selected device runs its own command. */
  const runSolo = async (deviceId: string) => {
    const cmd = (soloCommands[deviceId] || '').trim();
    const d = devices.find(x => x.id === deviceId);
    if (!cmd || !d) return;
    setSoloCommands(prev => ({ ...prev, [deviceId]: '' }));
    setMainLines(p => [...p, `[${ts()}] SOLO → ${d.hostname}: ${cmd}`]);
    await runOn(deviceId, d.hostname, cmd);
  };

  /** msg command — send a visible notice to the chosen devices. */
  const sendMsg = async () => {
    const message = msgText.trim();
    if (!message) return;
    const targets = selected.length ? selected : onlineDevices.map(d => d.id);
    if (!targets.length) return;
    setSending(true);
    try {
      const res = await fetch(`${API_BASE}/api/command/msg`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_ids: targets, message }),
      });
      const data = await res.json();
      if (res.ok) {
        setMainLines(p => [...p, `[${ts()}] MSG delivered to ${(data.delivered || []).length} device(s)`]);
        setMsgText('');
        setMsgOpen(false);
      } else {
        setMainLines(p => [...p, `[${ts()}] MSG failed: ${data.error || res.status}`]);
      }
    } catch (e) {
      setMainLines(p => [...p, `[${ts()}] MSG error: ${e instanceof Error ? e.message : 'request failed'}`]);
    } finally {
      setSending(false);
    }
  };

  const activeDevices = selected.length
    ? devices.filter(d => selected.includes(d.id))
    : onlineDevices;

  return (
    <div className="space-y-4">
      <PageHeader
        title="MULTI-SHELL"
        highlight="SHELL"
        subtitle={mode === 'main' ? 'Main Command · one command, many devices' : 'Solo Command · one command per device'}
        right={
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(v => !v)}
              aria-label="Shell mode"
              className="p-2.5 rounded-lg border border-green-500/20 bg-green-500/5 text-green-400 hover:bg-green-600 hover:text-white transition-all"
            >
              <MoreVertical size={18} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-52 glass-card border-green-500/20 z-50 overflow-hidden">
                <p className="px-3 py-2 text-[8px] font-orbitron uppercase tracking-widest text-slate-500 border-b border-white/5">
                  Shell mode
                </p>
                {([
                  { id: 'main', label: 'Main Command', desc: 'one command → all devices' },
                  { id: 'solo', label: 'Solo Command', desc: 'a command per device' },
                ] as const).map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => { setMode(opt.id); setMenuOpen(false); }}
                    className={`w-full text-left px-3 py-2.5 hover:bg-green-500/10 transition-colors border-b border-white/5 last:border-0 ${
                      mode === opt.id ? 'bg-green-500/10' : ''
                    }`}
                  >
                    <p className="text-[11px] font-orbitron text-slate-200">{opt.label}</p>
                    <p className="text-[9px] font-mono-data text-slate-500">{opt.desc}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        }
      />

      {/* Device chooser */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-orbitron uppercase tracking-widest text-slate-400">
            Target devices {selected.length > 0 && <span className="text-green-400">({selected.length} selected)</span>}
          </p>
          <div className="flex gap-2">
            <button onClick={() => setSelected(onlineDevices.map(d => d.id))}
              className="text-[9px] font-orbitron uppercase text-slate-500 hover:text-green-400">All online</button>
            <button onClick={() => setSelected([])}
              className="text-[9px] font-orbitron uppercase text-slate-500 hover:text-green-400">Clear</button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {devices.map(d => (
            <button
              key={d.id}
              onClick={() => toggleDevice(d.id)}
              disabled={d.status !== 'online'}
              className={`px-3 py-1.5 rounded-lg border text-[9px] font-orbitron uppercase transition-all disabled:opacity-30 ${
                selected.includes(d.id)
                  ? 'border-green-500/50 bg-green-500/10 text-green-300'
                  : 'border-white/10 bg-white/5 text-slate-500 hover:text-slate-300'
              }`}
            >
              {d.hostname} · {d.status}
            </button>
          ))}
          {devices.length === 0 && (
            <p className="text-[10px] font-mono-data text-slate-600">No devices registered yet.</p>
          )}
        </div>
      </div>

      {/* Main command bar */}
      <div className="glass-card p-4">
        <div className="flex items-center gap-3">
          <TerminalIcon size={16} className="text-green-500 shrink-0" />
          <input
            value={command}
            onChange={e => setCommand(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && mode === 'main') { e.preventDefault(); runMain(); } }}
            placeholder={mode === 'main'
              ? 'Type a command and press Enter to run it on every selected device…'
              : 'Solo mode: use the per-device terminals below.'}
            className="flex-1 bg-black/50 border border-green-500/20 rounded-lg px-3 py-2.5 text-[12px] font-mono-data text-green-300 placeholder-slate-600 focus:outline-none focus:border-green-500/50"
          />
          <button
            onClick={() => mode === 'main' ? runMain() : setMsgOpen(true)}
            className="px-4 py-2.5 rounded-lg bg-green-600/20 border border-green-500/40 text-green-300 hover:bg-green-600 hover:text-white transition-all flex items-center gap-2 text-[10px] font-orbitron uppercase"
          >
            {mode === 'main' ? <Send size={14} /> : <MessageSquare size={14} />}
            {mode === 'main' ? 'Run' : 'msg'}
          </button>
        </div>
        <p className="mt-2 text-[9px] font-mono-data text-slate-600">
          Targets: {activeDevices.length ? activeDevices.map(d => d.hostname).join(', ') : 'all online devices'}
        </p>
      </div>

      {/* Per-device terminals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {activeDevices.map(d => {
          const pane = panes[d.id];
          return (
            <div key={d.id} className="glass-card border-green-500/10 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-green-500/10 bg-black/30">
                <p className="text-[10px] font-orbitron uppercase tracking-widest text-green-400 truncate">
                  {d.hostname}
                </p>
                <span className="text-[8px] font-mono-data text-slate-600">{d.ip}</span>
              </div>

              <div className="h-44 overflow-y-auto aeyes-scroll p-3 bg-black/40 font-mono-data text-[11px] text-green-400/80">
                {(!pane || pane.lines.length === 0) && (
                  <p className="text-slate-600">Waiting for output…</p>
                )}
                {pane?.lines.map((l, i) => (
                  <div key={i} className={
                    l.startsWith('>') ? 'text-green-300 font-bold' :
                    l.startsWith('[error]') || l.startsWith('[failed]') ? 'text-red-400' :
                    l.startsWith('[success]') ? 'text-green-500' :
                    l.startsWith('[timeout]') ? 'text-amber-400' : ''
                  }>{l || '\u00A0'}</div>
                ))}
                {pane?.busy && <span className="text-amber-400 animate-pulse">▌</span>}
              </div>

              {mode === 'solo' && (
                <div className="flex items-center gap-2 px-3 py-2 border-t border-white/5">
                  <span className="text-[10px] font-mono-data text-green-600">$</span>
                  <input
                    value={soloCommands[d.id] || ''}
                    onChange={e => setSoloCommands(prev => ({ ...prev, [d.id]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); runSolo(d.id); } }}
                    placeholder="command for this device only…"
                    className="flex-1 bg-transparent text-[11px] font-mono-data text-green-300 placeholder-slate-600 focus:outline-none"
                  />
                  <button onClick={() => runSolo(d.id)}
                    className="p-1.5 rounded text-green-400 hover:bg-green-500/10">
                    <Send size={13} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {activeDevices.length === 0 && (
          <div className="glass-card p-8 text-center col-span-full">
            <p className="text-[10px] font-orbitron uppercase tracking-widest text-slate-500">
              No target devices — select devices above or bring an agent online.
            </p>
          </div>
        )}
      </div>

      {/* Main shell log */}
      <div className="glass-card border-green-500/10 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-green-500/10 bg-black/30 flex items-center justify-between">
          <p className="text-[10px] font-orbitron uppercase tracking-widest text-slate-400">Shell log</p>
          <button onClick={() => setMainLines([])}
            className="text-[9px] font-orbitron uppercase text-slate-600 hover:text-red-400">Clear display</button>
        </div>
        <div className="h-32 overflow-y-auto aeyes-scroll p-3 bg-black/40 font-mono-data text-[10px] text-slate-400">
          {mainLines.map((l, i) => <div key={i}>{l || '\u00A0'}</div>)}
          <div ref={mainEndRef} />
        </div>
      </div>

      {/* msg dialog */}
      {msgOpen && (
        <div className="fixed inset-0 z-[200] bg-black/70 flex items-center justify-center p-4">
          <div className="glass-card border-green-500/30 w-full max-w-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-orbitron uppercase tracking-widest text-green-400">
                Send message to devices
              </p>
              <button onClick={() => setMsgOpen(false)} className="text-slate-500 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <p className="text-[10px] font-mono-data text-slate-500 mb-3">
              Delivered as a visible on-screen notification on: {activeDevices.length
                ? activeDevices.map(d => d.hostname).join(', ')
                : 'all online devices'}
            </p>
            <textarea
              value={msgText}
              onChange={e => setMsgText(e.target.value)}
              rows={4}
              placeholder="e.g. Please step away from the keyboard, I need to take control for a few minutes."
              className="w-full bg-black/50 border border-green-500/20 rounded-lg p-3 text-[12px] font-rajdhani text-slate-200 placeholder-slate-600 focus:outline-none focus:border-green-500/50"
            />
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setMsgOpen(false)}
                className="px-4 py-2 rounded-lg border border-white/10 text-[10px] font-orbitron uppercase text-slate-400 hover:text-white">
                Cancel
              </button>
              <button onClick={sendMsg} disabled={sending || !msgText.trim()}
                className="px-4 py-2 rounded-lg bg-green-600/20 border border-green-500/40 text-green-300 hover:bg-green-600 hover:text-white transition-all text-[10px] font-orbitron uppercase disabled:opacity-40">
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MultiShell;
