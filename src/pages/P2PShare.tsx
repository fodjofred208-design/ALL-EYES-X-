import { useState, useEffect, useCallback } from 'react';
import { Share2, Download, Upload, File, HardDrive, Search, ArrowRight, ShieldCheck, Zap, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { useSocket } from '../context/SocketContext';
import { useDevices } from '../context/DeviceContext';
import { API_BASE, apiFetch } from '../utils/api';

interface TransferItem {
  transfer_id: string;
  filename: string;
  size: number;
  modified: string;
}

const P2PShare = () => {
  const { devices } = useDevices();
  const { socket, isConnected } = useSocket();
  const [progress, setProgress] = useState(0);
  const [isTransferring, setIsTransferring] = useState(false);
  const [transfers, setTransfers] = useState<TransferItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [targetNode, setTargetNode] = useState('all');
  const [statusMessage, setStatusMessage] = useState('');
  const [historyHidden, setHistoryHidden] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // Load existing transfers
  const fetchTransfers = useCallback(async () => {
    try {
      if (historyHidden) return;
      const data = await apiFetch('/api/transfer/list');
      setTransfers(data.transfers || []);
    } catch {
      // Silent
    }
  }, [historyHidden]);

  useEffect(() => {
    fetchTransfers();
    const interval = setInterval(fetchTransfers, 5000);
    return () => clearInterval(interval);
  }, [fetchTransfers]);

  // SocketIO file transfer updates
  useEffect(() => {
    if (!socket) return;

    const handleTransferUpdate = (data: { transfer_id: string; filename: string; size: number; target_device: string }) => {
      setStatusMessage(`Received: ${data.filename}`);
      fetchTransfers();
      setTimeout(() => setStatusMessage(''), 3000);
    };

    socket.on('file_transfer', handleTransferUpdate);

    return () => {
      socket.off('file_transfer', handleTransferUpdate);
    };
  }, [socket, fetchTransfers]);

  // Upload file to backend
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setSelectedFile(file);
      setStatusMessage(`Loaded ${file.name} by drag and drop`);
    }
  };

  const clearHistoryDisplay = () => {
    setHistoryHidden(true);
    setTransfers([]);
    setStatusMessage('Transfer history display cleared. Audit evidence and files were not deleted.');
  };

  const refreshHistoryDisplay = () => {
    setHistoryHidden(false);
    setTimeout(fetchTransfers, 0);
  };

  const startTransfer = useCallback(async () => {
    if (!selectedFile) return;

    setIsTransferring(true);
    setProgress(0);
    setStatusMessage(`Uploading ${selectedFile.name}...`);

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('target_device', targetNode);

    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${API_BASE}/api/transfer/upload`);
        xhr.withCredentials = true;

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            setProgress(Math.round((event.loaded / event.total) * 100));
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            setProgress(100);
            resolve();
          } else {
            reject(new Error(`HTTP ${xhr.status}`));
          }
        };
        xhr.onerror = () => reject(new Error('network error'));
        xhr.send(formData);
      });

      setStatusMessage(`✓ ${selectedFile.name} uploaded successfully`);
      await fetchTransfers();
      setSelectedFile(null);
      setTimeout(() => {
        setIsTransferring(false);
        setProgress(0);
        setStatusMessage('');
      }, 2000);
    } catch (err) {
      setStatusMessage(`✗ Upload failed: ${err instanceof Error ? err.message : 'unknown error'}`);
      setIsTransferring(false);
    }
  }, [selectedFile, targetNode, fetchTransfers]);

  // Download file
  const downloadFile = (transfer: TransferItem) => {
    window.open(`${API_BASE}/api/transfer/download/${transfer.transfer_id}/${transfer.filename}`, '_blank');
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 p-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-orbitron tracking-tight text-white uppercase">
            Neural <span className="text-green-500">Injection</span>
          </h1>
          <p className="text-slate-400 font-rajdhani text-xs tracking-widest mt-1 uppercase">Encrypted P2P Data Tunneling</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-green-600/10 border border-green-500/30 rounded-lg text-green-500 text-[10px] font-orbitron uppercase">
           <Zap size={14} />
           Tunnel: {isConnected ? 'LIVE' : 'REST'}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Transfer Interface */}
        <div className="lg:col-span-2 space-y-6">
           <div
             onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
             onDragLeave={() => setIsDragOver(false)}
             onDrop={handleDrop}
             className={`glass-card p-12 border-dashed flex flex-col items-center justify-center gap-8 min-h-[400px] transition-all ${isDragOver ? 'border-green-400/70 bg-green-500/10' : 'border-green-500/20 bg-green-500/2'}`}
           >
              <div className="relative">
                 <div className="p-8 rounded-full bg-green-500/10 text-green-500 border border-green-500/30">
                    <Share2 size={56} className={isTransferring ? 'animate-spin-slow' : ''} />
                 </div>
                 {isTransferring && (
                   <motion.div 
                     className="absolute inset-0 rounded-full border-2 border-green-500"
                     animate={{ scale: [1, 1.5], opacity: [1, 0] }}
                     transition={{ duration: 1.5, repeat: Infinity }}
                   />
                 )}
              </div>
              <div className="text-center max-w-md">
                 <h3 className="text-2xl font-orbitron text-white mb-3 tracking-widest uppercase">Injection Console</h3>
                 <p className="text-slate-500 font-rajdhani text-sm leading-relaxed">
                    Select a target neural node or drag and drop a file here to initiate an authorized data stream.
                 </p>
                 {statusMessage && (
                   <p className="text-green-500 text-xs font-mono-data mt-2">{statusMessage}</p>
                 )}
              </div>
              
              {/* Target selector + File picker */}
              <div className="flex flex-wrap justify-center gap-4 items-center">
                 <select 
                   className="bg-black/40 border border-green-500/30 text-green-400 px-4 py-3 rounded-xl text-xs font-orbitron"
                   value={targetNode}
                   onChange={(e) => setTargetNode(e.target.value)}
                   disabled={isTransferring}
                 >
                   <option value="all">ALL NODES</option>
                   {devices.map(d => (
                     <option key={d.id} value={d.id}>{d.hostname}</option>
                   ))}
                 </select>
                 
                 <label className="px-8 py-3 bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 rounded-xl font-orbitron text-xs font-bold transition-all cursor-pointer flex items-center gap-2">
                    <Upload size={18} />
                    {selectedFile ? selectedFile.name : 'LOAD SOURCE'}
                    <input type="file" onChange={handleFileSelect} className="hidden" disabled={isTransferring} />
                 </label>
                 
                 <button 
                   onClick={startTransfer}
                   disabled={isTransferring || !selectedFile}
                   className="px-8 py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl font-orbitron text-xs font-bold transition-all shadow-[0_0_20px_rgba(34,197,94,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
                 >
                    {isTransferring ? 'TRANSFERRING...' : 'INITIATE TUNNEL'}
                 </button>
                 
                 {selectedFile && (
                   <button onClick={() => setSelectedFile(null)} className="p-2 text-red-500 hover:text-red-400">
                     <X size={18} />
                   </button>
                 )}
              </div>
           </div>

           {isTransferring && (
             <motion.div 
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               className="glass-card p-8 border-green-500/30"
             >
                <div className="flex justify-between items-center mb-6">
                   <div className="flex items-center gap-4">
                      <div className="p-3 bg-green-500/10 rounded-xl">
                         <File className="text-green-500" />
                      </div>
                      <div>
                         <p className="text-base font-bold text-white font-orbitron">{selectedFile?.name || 'TRANSFER'}</p>
                         <p className="text-[10px] text-slate-500 font-mono-data uppercase mt-1">
                            {((progress/100) * (selectedFile?.size || 1024) / (1024*1024)).toFixed(1)} MB / {(selectedFile?.size || 0) / (1024*1024) > 0 ? ((selectedFile?.size || 0) / (1024*1024)).toFixed(1) : '0.0'} MB
                         </p>
                      </div>
                   </div>
                   <div className="text-xl font-mono-data text-green-500 font-bold">{progress.toFixed(0)}%</div>
                </div>
                <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                   <motion.div 
                     className="h-full bg-gradient-to-r from-green-600 to-green-400 shadow-[0_0_15px_rgba(34,197,94,0.5)]"
                     style={{ width: `${progress}%` }}
                   />
                </div>
                <div className="mt-6 flex justify-between items-center text-[10px] font-orbitron uppercase text-slate-500 tracking-widest">
                   <div className="flex items-center gap-4">
                      <span className="text-green-500/60">SOURCE: CORTEX-SVR</span>
                      <ArrowRight size={12} className="text-green-500" />
                      <span className="text-green-500/60">TARGET: {targetNode === 'all' ? 'ALL NODES' : targetNode}</span>
                   </div>
                   <span className="flex items-center gap-2">
                      <ShieldCheck size={12} className="text-green-500" />
                      Stealth Mode: ACTIVE
                   </span>
                </div>
             </motion.div>
           )}

           <div className="glass-card overflow-hidden">
              <div className="p-5 bg-white/5 border-b border-white/5 flex justify-between items-center">
                 <h4 className="text-xs font-orbitron text-slate-400 uppercase tracking-widest">Injection History</h4>
                 <div className="flex gap-3">
                   <button onClick={refreshHistoryDisplay} className="text-[10px] font-orbitron text-green-900 hover:text-green-500 transition-colors uppercase">Refresh</button>
                   <button onClick={clearHistoryDisplay} className="text-[10px] font-orbitron text-red-900 hover:text-red-400 transition-colors uppercase">Clear Display</button>
                 </div>
              </div>
              <div className="divide-y divide-white/5">
                 {transfers.length === 0 ? (
                   <div className="p-8 text-center text-slate-600 text-xs font-rajdhani">No transfers yet</div>
                 ) : (
                   transfers.map((t) => (
                     <div key={t.transfer_id} className="p-4 flex items-center justify-between hover:bg-green-500/5 transition-all group">
                        <div className="flex items-center gap-4">
                           <div className="p-2 bg-green-500/5 border border-green-500/10 text-green-950 group-hover:text-green-500 rounded-lg transition-colors">
                              <File size={16} />
                           </div>
                           <div>
                              <p className="text-sm font-rajdhani text-slate-300 group-hover:text-white transition-colors">{t.filename}</p>
                              <p className="text-[10px] font-mono-data text-slate-600">{formatSize(t.size)}</p>
                           </div>
                        </div>
                        <div className="flex items-center gap-6">
                           <span className="text-[9px] font-orbitron text-green-600 font-bold tracking-widest">INJECTED</span>
                           <button onClick={() => downloadFile(t)} className="p-2 text-slate-700 hover:text-green-500 transition-colors">
                              <Download size={14} />
                           </button>
                        </div>
                     </div>
                   ))
                 )}
              </div>
           </div>
        </div>

        {/* Node Matrix */}
        <div className="space-y-6">
           <div className="glass-card p-6 border-green-500/10">
              <div className="relative mb-8">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-green-900" size={16} />
                 <input 
                   type="text" 
                   placeholder="SEARCH NODES..." 
                   className="w-full bg-black/40 border border-green-500/10 rounded-xl py-3 pl-10 pr-4 text-[10px] text-green-400 font-orbitron focus:outline-none focus:border-green-500/50 uppercase"
                 />
              </div>
              <h4 className="text-[10px] font-orbitron text-slate-500 uppercase tracking-[0.3em] mb-4">Neural Grid</h4>
              <div className="space-y-3">
                 {devices.length === 0 ? (
                   <div className="text-center text-slate-700 text-xs py-8">No nodes connected</div>
                 ) : (
                   devices.map(device => (
                     <div 
                       key={device.id} 
                       className={`p-4 border rounded-2xl flex items-center justify-between group cursor-pointer transition-all ${
                         device.status === 'online' 
                           ? 'bg-white/5 border-white/5 hover:border-green-500/30 hover:bg-green-500/5' 
                           : 'bg-black/20 border-white/5 opacity-40'
                       }`}
                       onClick={() => setTargetNode(device.id)}
                     >
                        <div className="flex items-center gap-4">
                           <div className="p-2 bg-green-500/10 rounded-lg">
                              <HardDrive size={18} className="text-green-500" />
                           </div>
                           <div>
                              <p className="text-xs font-bold text-white uppercase font-orbitron">{device.hostname}</p>
                              <p className="text-[10px] text-slate-500 font-rajdhani">{device.ip}</p>
                           </div>
                        </div>
                        <div className={`w-1.5 h-1.5 rounded-full ${
                          device.status === 'online' 
                            ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.8)]' 
                            : 'bg-slate-600'
                        }`} />
                     </div>
                   ))
                 )}
              </div>
           </div>

           <div className="glass-card p-6 bg-green-950/10 border-green-900/30">
              <div className="flex items-center gap-3 mb-6">
                 <ShieldCheck className="text-green-500" size={24} />
                 <h4 className="text-sm font-orbitron text-white tracking-widest uppercase">Stealth Policy</h4>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed font-rajdhani italic">
                 "Transfers are logged, permission-bound, and should be used only for authorized administration."
              </p>
           </div>
        </div>
      </div>
    </div>
  );
};

export default P2PShare;