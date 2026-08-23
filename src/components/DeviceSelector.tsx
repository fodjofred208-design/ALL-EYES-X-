import { useDevices } from '../context/DeviceContext';
import { Monitor, ChevronDown, Cpu, Smartphone } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';

const DeviceSelector = () => {
  const { devices, selectedDevice, setSelectedDeviceId } = useDevices();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 px-4 py-2 bg-black/40 border border-green-500/20 rounded-xl hover:border-green-500/50 transition-all group"
      >
        <div className={`p-1.5 rounded-lg ${selectedDevice ? 'bg-green-500/10 text-green-500' : 'bg-slate-500/10 text-slate-500'}`}>
           {selectedDevice?.os?.includes('Android') ? <Smartphone size={16} /> : <Monitor size={16} />}
        </div>
        <div className="text-left">
           <p className="text-[8px] font-orbitron text-slate-500 uppercase tracking-widest leading-none mb-1">Target Node</p>
           <p className="text-xs font-bold text-white uppercase tracking-tighter">
             {selectedDevice ? selectedDevice.hostname : 'No Target Selected'}
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
            className="absolute top-full left-0 mt-2 w-64 glass-card border-green-500/20 z-[100] overflow-hidden"
          >
             <div className="p-3 bg-green-500/5 border-b border-white/5">
                <span className="text-[9px] font-orbitron text-green-500 uppercase tracking-widest">Active Neural Nodes</span>
             </div>
             <div className="max-h-64 overflow-y-auto py-1">
                {devices.length === 0 ? (
                  <div className="p-4 text-center">
                    <p className="text-[10px] text-slate-600 font-rajdhani italic">Scanning for signals...</p>
                  </div>
                ) : (
                  devices.map(device => (
                    <button
                      key={device.id}
                      onClick={() => {
                        setSelectedDeviceId(device.id);
                        setIsOpen(false);
                      }}
                      className={`w-full p-3 flex items-center gap-3 hover:bg-green-500/10 transition-all text-left border-b border-white/5 last:border-0 ${selectedDevice?.id === device.id ? 'bg-green-500/5' : ''}`}
                    >
                       <div className={`p-1.5 rounded-lg ${device.status === 'online' ? 'bg-green-500/10 text-green-500' : 'bg-slate-500/10 text-slate-500'}`}>
                          {device.os.includes('Android') ? <Smartphone size={14} /> : <Cpu size={14} />}
                       </div>
                       <div>
                          <p className="text-xs font-bold text-white">{device.hostname}</p>
                          <p className="text-[9px] font-mono-data text-slate-500">{device.ip} • {device.os}</p>
                       </div>
                    </button>
                  ))
                )}
             </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default DeviceSelector;
