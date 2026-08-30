import { useDevices } from '../context/DeviceContext';
import { Monitor, ChevronDown, Globe, Wifi } from 'lucide-react';
import DeviceIcon from './DeviceIcon';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';

const ALL_EYES = 'ALL EYES STAT';

const DeviceSelector = () => {
  const { devices, selectedDevice, setSelectedDeviceId } = useDevices();
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Click anywhere outside the dropdown to dismiss it.
  useEffect(() => {
    if (!isOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [isOpen]);

  const onlineCount = devices.filter(d => d.status === 'online').length;

  const pick = (id: string | null) => {
    setSelectedDeviceId(id);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 px-4 py-2 bg-black/40 border border-green-500/20 rounded-xl hover:border-green-500/50 transition-all group"
      >
        <div className={`p-1.5 rounded-lg ${selectedDevice ? 'bg-green-500/10 text-green-500' : 'bg-cyan-500/10 text-cyan-400'}`}>
           {selectedDevice
             ? (
               <DeviceIcon
                 hostname={selectedDevice.hostname}
                 os={selectedDevice.os || selectedDevice.os_name || ''}
                 size={16}
                 online={selectedDevice.status === 'online'}
               />
             )
             : <Globe size={16} />}
        </div>
        <div className="text-left">
           <p className="text-[8px] font-orbitron text-slate-500 uppercase tracking-widest leading-none mb-1">Target Node</p>
           <p className="text-xs font-bold text-white uppercase tracking-tighter">
             {selectedDevice ? selectedDevice.hostname : ALL_EYES}
           </p>
        </div>
        <ChevronDown size={14} className={`text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute top-full left-0 mt-2 w-72 glass-card border-green-500/20 z-[100] overflow-hidden"
          >
             <div className="p-3 bg-green-500/5 border-b border-white/5">
                <span className="text-[9px] font-orbitron text-green-500 uppercase tracking-widest">Active Neural Nodes</span>
             </div>

             {/* whole-system scope */}
             <button
               onClick={() => pick(null)}
               className={`w-full p-3 flex items-center gap-3 hover:bg-cyan-500/10 transition-all text-left border-b border-white/5 ${
                 !selectedDevice ? 'bg-cyan-500/10' : ''
               }`}
             >
               <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-300">
                 <Globe size={14} />
               </div>
               <div className="flex-1 min-w-0">
                 <p className="text-xs font-bold text-cyan-200 tracking-wide">{ALL_EYES}</p>
                 <p className="text-[9px] font-mono-data text-slate-500">
                   aggregate statistics for the entire system
                 </p>
               </div>
               {!selectedDevice && <span className="text-[8px] font-orbitron text-cyan-300">ACTIVE</span>}
             </button>

             <div className="max-h-64 overflow-y-auto py-1">
                {devices.length === 0 ? (
                  <div className="p-4 text-center">
                    <p className="text-[10px] text-slate-600 font-rajdhani italic">Scanning for signals...</p>
                  </div>
                ) : (
                  devices.map(device => {
                    const online = device.status === 'online';
                    return (
                      <button
                        key={device.id}
                        onClick={() => pick(device.id)}
                        className={`w-full p-3 flex items-center gap-3 hover:bg-green-500/10 transition-all text-left border-b border-white/5 last:border-0 ${selectedDevice?.id === device.id ? 'bg-green-500/5' : ''}`}
                      >
                         <div className={`p-1.5 rounded-lg ${online ? 'bg-green-500/10 text-green-500' : 'bg-slate-500/10 text-slate-500'}`}>
                            <DeviceIcon
                              hostname={device.hostname}
                              os={device.os || device.os_name || ''}
                              size={14}
                              online={online}
                            />
                         </div>
                         <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-white truncate">{device.hostname}</p>
                            <p className="text-[9px] font-mono-data text-slate-500 truncate">
                              {device.ip} · {device.os || device.os_name || '—'}
                            </p>
                         </div>
                         <span className={`text-[8px] font-orbitron ${online ? 'text-green-400' : 'text-slate-600'}`}>
                           {online ? 'ONLINE' : 'OFFLINE'}
                         </span>
                      </button>
                    );
                  })
                )}
             </div>

             <div className="p-2 bg-black/40 border-t border-white/5 flex items-center justify-between">
               <span className="flex items-center gap-1.5 text-[9px] font-mono-data text-slate-500">
                 <Wifi size={10} className="text-green-500" />
                 {onlineCount} online / {devices.length} registered
               </span>
               <span className="text-[8px] font-orbitron text-slate-600">
                 {selectedDevice ? 'SCOPED VIEW' : 'SYSTEM VIEW'}
               </span>
             </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default DeviceSelector;
