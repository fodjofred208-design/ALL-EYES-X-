import { useState, useRef, useEffect, useCallback } from 'react';
import { Terminal as TerminalIcon, ShieldAlert, Hash, Globe, ChevronRight, Zap, Download, Trash2, Layers } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDevices } from '../context/DeviceContext';
import { useSocket } from '../context/SocketContext';
import { apiFetch } from '../utils/api';

type ManagedCommand = {
  name: string;
  label: string;
  category: 'System' | 'Network' | 'Security' | 'Identity' | 'Storage' | 'Operations';
  description: string;
  critical?: boolean;
};

type CommandResult = {
  id?: number;
  command_id: string;
  device_id: string;
  command: string;
  result: string;
  success: number;
  requested_by: string;
  queued_at: string;
  completed_at: string;
};

const COMMAND_CATALOG: ManagedCommand[] = [
  { name: 'sys_info', label: 'System profile', category: 'System', description: 'Complete OS and hardware summary', critical: true },
  { name: 'os_info', label: 'OS version', category: 'System', description: 'Operating system edition, version, build, architecture' },
  { name: 'hostname', label: 'Hostname', category: 'System', description: 'Report device hostname' },
  { name: 'whoami', label: 'Current user', category: 'Identity', description: 'Report current execution identity' },
  { name: 'uptime', label: 'Uptime', category: 'System', description: 'Show boot time / uptime' },
  { name: 'cpu_info', label: 'CPU info', category: 'System', description: 'Processor model, cores, threads and clock' },
  { name: 'cpu_usage', label: 'CPU usage', category: 'System', description: 'Current CPU load snapshot' },
  { name: 'mem_info', label: 'Memory info', category: 'System', description: 'Installed/visible memory' },
  { name: 'mem_usage', label: 'Memory usage', category: 'System', description: 'Available and used memory snapshot' },
  { name: 'disk_usage', label: 'Disk usage', category: 'Storage', description: 'Volume usage, free space and filesystem', critical: true },
  { name: 'disk_list', label: 'Disk inventory', category: 'Storage', description: 'Physical disk inventory and health status' },
  { name: 'ip_config', label: 'IP config', category: 'Network', description: 'Full IP configuration', critical: true },
  { name: 'net_interfaces', label: 'Interfaces', category: 'Network', description: 'Network interface state' },
  { name: 'route_table', label: 'Routes', category: 'Network', description: 'Routing table' },
  { name: 'arp_table', label: 'ARP table', category: 'Network', description: 'Local neighbor cache' },
  { name: 'dns_cache', label: 'DNS cache/config', category: 'Network', description: 'DNS cache or resolver configuration' },
  { name: 'net_stat', label: 'Connections', category: 'Network', description: 'Active network connections', critical: true },
  { name: 'listening_ports', label: 'Listening ports', category: 'Network', description: 'Local services listening for inbound connections', critical: true },
  { name: 'firewall_status', label: 'Firewall status', category: 'Security', description: 'Firewall profile state', critical: true },
  { name: 'firewall_rules', label: 'Firewall rules', category: 'Security', description: 'Configured firewall rules' },
  { name: 'defender_status', label: 'Defender/AV', category: 'Security', description: 'Endpoint protection status where supported', critical: true },
  { name: 'process_list', label: 'Processes', category: 'System', description: 'Running process list', critical: true },
  { name: 'services_list', label: 'Services', category: 'System', description: 'Installed/running service list', critical: true },
  { name: 'startup_items', label: 'Startup items', category: 'Security', description: 'Startup persistence locations', critical: true },
  { name: 'scheduled_tasks', label: 'Scheduled tasks', category: 'Security', description: 'Scheduled task / cron inventory', critical: true },
  { name: 'users', label: 'Users', category: 'Identity', description: 'Local user accounts' },
  { name: 'logged_user', label: 'Logged user', category: 'Identity', description: 'Current user SID/identity' },
  { name: 'sessions', label: 'Sessions', category: 'Identity', description: 'Interactive sessions' },
  { name: 'env_vars', label: 'Environment', category: 'System', description: 'Environment variables' },
  { name: 'installed_apps', label: 'Installed apps', category: 'Security', description: 'Installed software inventory' },
  { name: 'hotfixes', label: 'Updates', category: 'Security', description: 'Installed patches or update history', critical: true },
  { name: 'event_errors', label: 'System errors', category: 'Security', description: 'Recent critical/error system logs', critical: true },
  { name: 'event_security_recent', label: 'Security logs', category: 'Security', description: 'Recent security log entries', critical: true },
  { name: 'usb_devices', label: 'USB devices', category: 'Security', description: 'USB device inventory/activity indicators' },
  { name: 'battery_status', label: 'Battery', category: 'System', description: 'Battery/charge status where supported' },
  { name: 'wifi_status', label: 'Wi-Fi status', category: 'Network', description: 'Wireless interface status' },
  { name: 'wifi_profiles', label: 'Wi-Fi profiles', category: 'Network', description: 'Known Wi-Fi profiles without revealing passwords' },
  { name: 'shares', label: 'Shares', category: 'Network', description: 'Local network shares' },
  { name: 'printers', label: 'Printers', category: 'System', description: 'Printer inventory' },
  { name: 'drivers', label: 'Drivers/modules', category: 'Security', description: 'Driver/module inventory' },
  { name: 'current_dir', label: 'Working dir', category: 'Operations', description: 'Agent working directory' },
  { name: 'list_home', label: 'Home listing', category: 'Operations', description: 'List user home root only' },
  { name: 'temp_usage', label: 'Temp usage', category: 'Storage', description: 'Temporary folder size/listing' },
  { name: 'python_version', label: 'Python version', category: 'System', description: 'Python runtime version' },
  { name: 'agent_status', label: 'Agent status', category: 'Operations', description: 'Agent liveness echo' },
  { name: 'ping_gateway', label: 'Ping gateway', category: 'Network', description: 'Connectivity test to default gateway' },
  { name: 'trace_dns', label: 'Trace DNS', category: 'Network', description: 'Route trace to public DNS for diagnostics' },
  { name: 'net_accounts', label: 'Account policy', category: 'Security', description: 'Local account/password policy where supported' },
  { name: 'lock_screen', label: 'Lock screen', category: 'Operations', description: 'Lock the interactive session', critical: true },
  { name: 'reboot', label: 'Reboot', category: 'Operations', description: 'Authorized delayed reboot request', critical: true },
  { name: 'shutdown', label: 'Shutdown', category: 'Operations', description: 'Authorized delayed shutdown request', critical: true },
];

const Terminal = () => {
  const navigate = useNavigate();
  const { devices, selectedDevice, setSelectedDeviceId } = useDevices();
  const { socket, isConnected } = useSocket();
  const [history, setHistory] = useState<string[]>([
    'BLACK CORTEX [Universal Control v1.0]',
    '(c) 2026 Department of Black Cortex. Authorized administration console.',
    '',
    'Secure Uplink: READY',
    'Type "help" for 50+ managed administrative commands.',
    'Raw shell is disabled unless the agent explicitly allows shell: commands.',
    ''
  ]);
  const [input, setInput] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [multiMode, setMultiMode] = useState(false);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [commandResults, setCommandResults] = useState<CommandResult[]>([]);
  const [resultsVisible, setResultsVisible] = useState(true);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });

  useEffect(() => { scrollToBottom(); }, [history]);

  const fetchCommandResults = useCallback(async () => {
    try {
      const data = await apiFetch<{ results: CommandResult[] }>('/api/command/results?limit=50');
      setCommandResults(data.results || []);
    } catch {
      // Backend may require login or be offline; terminal remains usable.
    }
  }, []);

  useEffect(() => {
    fetchCommandResults();
    const t = setInterval(fetchCommandResults, 8000);
    return () => clearInterval(t);
  }, [fetchCommandResults]);

  useEffect(() => {
    if (!socket) return;

    const handleCommandResult = (data: { device_id: string; result: string; success: boolean }) => {
      if (selectedDevice && data.device_id === selectedDevice.id) {
        setHistory(prev => [...prev, `[RESULT] ${data.success ? 'SUCCESS' : 'FAILED'}`, data.result, '']);
        fetchCommandResults();
        setIsExecuting(false);
      }
    };

    socket.on('command_completed', handleCommandResult);
    return () => { socket.off('command_completed', handleCommandResult); };
  }, [socket, selectedDevice, fetchCommandResults]);

  const toggleDeviceSelection = (deviceId: string) => {
    setSelectedDeviceIds(prev => prev.includes(deviceId) ? prev.filter(id => id !== deviceId) : [...prev, deviceId]);
  };

  const exportResults = () => {
    const content = commandResults.map(r => [
      `Device: ${r.device_id}`,
      `Command: ${r.command}`,
      `Timestamp: ${r.completed_at || r.queued_at}`,
      `Status: ${r.success ? 'SUCCESS' : 'FAILED/PENDING'}`,
      'Result:',
      r.result || 'No result reported yet.',
      '---',
    ].join('\n')).join('\n');
    const blob = new Blob([content || 'No command results displayed.'], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `all-eyes-x-terminal-results-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const printHelp = (base: string[]) => {
    const lines = [...base, `MANAGED COMMAND CATALOG (${COMMAND_CATALOG.length}):`, ''];
    const categories = Array.from(new Set(COMMAND_CATALOG.map(c => c.category)));
    categories.forEach(category => {
      lines.push(`${category.toUpperCase()}:`);
      COMMAND_CATALOG.filter(c => c.category === category).forEach(c => {
        lines.push(`  ${c.name.padEnd(22)} ${c.critical ? '[CRITICAL] ' : ''}${c.description}`);
      });
      lines.push('');
    });
    lines.push('LOCAL: clear, devices, help');
    lines.push('NOTE: commands are audited and delivered only to the selected authorized device.');
    setHistory(lines);
  };

  const handleCommand = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim()) return;

    const raw = input.trim();
    const cmd = raw.toLowerCase();
    const newHistory = [...history, `> ${raw}`];
    setHistory(newHistory);
    setInput('');

    if (cmd === 'clear') {
      setHistory(['Buffer purged.']);
      return;
    }

    if (cmd === 'help') {
      printHelp(newHistory);
      return;
    }

    if (cmd === 'devices') {
      const list = ['CONNECTED NEURAL NODES:', ''];
      devices.forEach(d => list.push(`  ${d.hostname.padEnd(20)} ${d.ip.padEnd(16)} ${d.status.toUpperCase()}`));
      list.push('');
      setHistory([...newHistory, ...list]);
      return;
    }

    const managed = COMMAND_CATALOG.some(c => c.name === cmd) || cmd.startsWith('shell:');
    if (!managed) {
      setHistory([...newHistory, `ERROR: Unknown command "${raw}". Type help for the 50 managed commands.`, '']);
      return;
    }

    const targetIds = multiMode ? selectedDeviceIds : (selectedDevice ? [selectedDevice.id] : []);
    if (targetIds.length === 0) {
      setHistory([...newHistory, 'ERROR: No device selected.']);
      return;
    }

    setIsExecuting(true);
    setHistory([...newHistory, `QUEUING AUTHORIZED COMMAND FOR ${targetIds.length} DEVICE(S)...`]);

    try {
      const queued: string[] = [];
      for (const deviceId of targetIds) {
        const result = await apiFetch<{ command_id?: string }>('/api/command', {
          method: 'POST',
          body: JSON.stringify({ device_id: deviceId, command: cmd }),
        });
        queued.push(`${deviceId.slice(0, 8)}:${(result.command_id || '').slice(0, 8)}`);
      }

      setHistory(prev => {
        const filtered = prev.filter(l => !l.startsWith('QUEUING AUTHORIZED COMMAND'));
        return [...filtered, `Command queued on ${targetIds.length} device(s): ${queued.join(', ')}`, 'Waiting for execution result...', '']; 
      });

      if (!isConnected) {
        setTimeout(() => {
          setHistory(prev => [...prev, '[STATUS] Command queued. Socket is offline; result will appear when received.', '']);
          setIsExecuting(false);
        }, 5000);
      }
    } catch (err) {
      setHistory(prev => {
        const filtered = prev.filter(l => l !== 'QUEUING AUTHORIZED COMMAND...');
        return [...filtered, `ERROR: ${err instanceof Error ? err.message : 'command failed'}`, '']; 
      });
      setIsExecuting(false);
    }
  }, [input, history, selectedDevice, selectedDeviceIds, multiMode, devices, isConnected]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey && document.activeElement?.tagName === 'INPUT') {
        handleCommand();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleCommand]);

  const quickCommands = ['help', 'devices', 'sys_info', 'listening_ports', 'firewall_status', 'process_list', 'event_errors', 'clear'];

  return (
    <div className="max-w-7xl mx-auto h-[calc(100vh-140px)] flex flex-col space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-500/10 border border-green-500/30 rounded-lg">
             <TerminalIcon size={20} className="text-green-500" />
          </div>
          <h1 className="text-2xl font-bold font-orbitron tracking-tight text-white uppercase">
            Control <span className="text-green-500">Terminal</span>
          </h1>
        </div>
        <div className="flex gap-4 items-center">
           <button
             onClick={() => setMultiMode(v => !v)}
             className={`flex items-center gap-2 px-3 py-1 rounded text-[10px] font-orbitron uppercase border ${multiMode ? 'bg-cyan-500/10 border-cyan-400/40 text-cyan-300' : 'bg-black/40 border-green-500/30 text-green-400'}`}
           >
             <Layers size={12} /> {multiMode ? 'MULTI' : 'SINGLE'}
           </button>
           <select
             className="bg-black/40 border border-green-500/30 text-green-400 px-3 py-1 rounded text-xs font-orbitron"
             value={selectedDevice?.id || ''}
             onChange={(e) => setSelectedDeviceId(e.target.value || null)}
             disabled={multiMode}
           >
             <option value="">SELECT TARGET</option>
             {devices.map(d => <option key={d.id} value={d.id}>{d.hostname}</option>)}
           </select>
           <button
             onClick={() => navigate('/multi-shell')}
             className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/40 rounded text-green-300 hover:bg-green-600 hover:text-white transition-all text-[10px] font-orbitron uppercase"
             title="Open the Multi-Shell page (Main Command / Solo Command)"
           >
             <Layers size={12} />
             Multi-Shell
           </button>
           <div className="flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/30 rounded text-amber-400 text-[10px] font-orbitron uppercase">
             <ShieldAlert size={12} />
             Audited Admin Mode
           </div>
           <div className="flex items-center gap-2 px-3 py-1 bg-green-500/10 border border-green-500/30 rounded text-green-500 text-[10px] font-orbitron uppercase">
             <Zap size={12} />
             {selectedDevice ? selectedDevice.hostname.slice(0, 8) : 'NO NODE'}
           </div>
        </div>
      </div>

      {multiMode && (
        <div className="glass-card p-3 border-cyan-500/20">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-orbitron text-cyan-300 uppercase tracking-widest">Multi-device execution targets</p>
            <p className="text-[10px] font-mono-data text-slate-500">{selectedDeviceIds.length} selected</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {devices.map(d => (
              <button
                key={d.id}
                onClick={() => toggleDeviceSelection(d.id)}
                className={`px-3 py-1.5 rounded-lg border text-[9px] font-orbitron uppercase ${selectedDeviceIds.includes(d.id) ? 'bg-cyan-500/10 border-cyan-400/50 text-cyan-300' : 'bg-white/5 border-white/10 text-slate-500'}`}
              >
                {d.hostname} · {d.status}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 glass-card border-green-500/10 flex flex-col overflow-hidden shadow-[inset_0_0_100px_rgba(0,0,0,0.8)]">
        <div className="flex-1 overflow-y-auto p-8 font-mono-data text-sm text-green-400/80 custom-scrollbar bg-black/40">
          {history.map((line, i) => (
            <div key={i} className={`mb-1.5 ${
              line.startsWith('>') ? 'text-green-400 font-bold' : 
              line.includes('ERROR') || line.includes('FAILED') ? 'text-red-500' : 
              line.includes('[CRITICAL]') ? 'text-amber-300' :
              line.startsWith('  ') ? 'text-slate-500' : ''
            }`}>
               {line}
            </div>
          ))}
          {isExecuting && <div className="text-yellow-400 animate-pulse">▌</div>}
          <div ref={terminalEndRef} />
        </div>

        <form onSubmit={handleCommand} className="p-5 bg-black/60 border-t border-white/5 flex items-center gap-4">
          <div className="text-green-500 font-bold flex items-center gap-2">
             <ChevronRight size={18} />
             <span className="text-[10px] uppercase font-orbitron text-green-500/50 tracking-widest">admin@cortex:~$</span>
          </div>
          <input 
            type="text"
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isExecuting}
            className="flex-1 bg-transparent border-none outline-none text-green-400 font-mono-data placeholder-green-900 caret-green-500"
            placeholder={selectedDevice ? 'Enter managed command...' : 'Select a device first...'}
          />
          <div className="flex gap-4 text-[10px] font-orbitron text-slate-700 uppercase tracking-tighter">
             <div className="flex items-center gap-1"><Globe size={10} />{isConnected ? 'LIVE' : 'REST'}</div>
             <div className="flex items-center gap-1"><Hash size={10} />Session</div>
          </div>
        </form>
      </div>

      {resultsVisible && (
        <div className="glass-card p-4 border-green-500/10 max-h-52 overflow-y-auto custom-scrollbar">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-orbitron text-white uppercase tracking-widest">Command Result Evidence Panel</h3>
            <div className="flex gap-2">
              <button onClick={fetchCommandResults} className="px-3 py-1 text-[9px] font-orbitron text-green-400 border border-green-500/20 rounded">REFRESH</button>
              <button onClick={exportResults} className="px-3 py-1 text-[9px] font-orbitron text-cyan-300 border border-cyan-500/20 rounded flex items-center gap-1"><Download size={11}/>EXPORT TXT</button>
              <button onClick={() => { setResultsVisible(false); setCommandResults([]); }} className="px-3 py-1 text-[9px] font-orbitron text-red-300 border border-red-500/20 rounded flex items-center gap-1"><Trash2 size={11}/>CLEAR DISPLAY</button>
            </div>
          </div>
          {commandResults.length === 0 ? (
            <p className="text-xs text-slate-600">No command results displayed. Clearing this panel does not delete audit evidence.</p>
          ) : commandResults.slice(0, 8).map(r => (
            <div key={`${r.command_id}-${r.id}`} className="mb-2 p-2 rounded bg-black/30 border border-white/5">
              <div className="flex justify-between gap-3 text-[10px] font-mono-data">
                <span className="text-green-400">{r.device_id.slice(0, 8)} · {r.command}</span>
                <span className={r.success ? 'text-green-400' : 'text-yellow-400'}>{r.success ? 'SUCCESS' : 'PENDING/FAILED'}</span>
              </div>
              <pre className="mt-1 whitespace-pre-wrap text-[10px] text-slate-500 max-h-20 overflow-hidden">{r.result || 'Waiting for result...'}</pre>
            </div>
          ))}
        </div>
      )}
      {!resultsVisible && (
        <button onClick={() => { setResultsVisible(true); fetchCommandResults(); }} className="self-start px-3 py-1 text-[9px] font-orbitron text-green-400 border border-green-500/20 rounded">SHOW RESULT PANEL</button>
      )}

      <div className="flex flex-wrap gap-2">
         {quickCommands.map(q => (
           <button 
             key={q}
             onClick={() => setInput(q)}
             className="px-4 py-1.5 bg-green-500/5 border border-green-500/20 rounded-lg text-[9px] font-orbitron text-green-600 hover:text-green-400 hover:border-green-500/50 hover:bg-green-500/10 transition-all uppercase tracking-widest"
           >
             {q}
           </button>
         ))}
      </div>
    </div>
  );
};

export default Terminal;
