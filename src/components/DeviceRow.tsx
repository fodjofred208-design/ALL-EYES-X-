import React, { useState } from 'react';
import { motion } from 'framer-motion';
import DeviceIcon from './DeviceIcon';
import DeviceDeleteDialog from './DeviceDeleteDialog';


interface Device {
  id: string;
  hostname: string;
  ip: string;
  os_name: string;
  os_version: string;
  status: string;
  last_seen: string;
  cpu: string;
  ram: string;
  [key: string]: unknown;
}

interface DeviceRowProps {
  device: Device;
  index: number;
  onDelete: (deviceId: string) => Promise<boolean>;
  onClick: (deviceId: string) => void;
}

const DeviceRow: React.FC<DeviceRowProps> = ({ device, index, onDelete, onClick }) => {
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isOnline = device.status === 'online';

  const handleClick = () => {
    if (onClick && !deleting) onClick(device.id);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDelete(true);
  };

  const handleConfirmDelete = async () => {
    setDeleting(true);
    setShowDelete(false);
    const ok = await onDelete(device.id);
    if (!ok) setDeleting(false);
  };

  const relativeTime = (isoStr: string) => {
    if (!isoStr) return 'Never';
    try {
      const diff = Date.now() - new Date(isoStr).getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return 'Just now';
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs}h ago`;
      return `${Math.floor(hrs / 24)}d ago`;
    } catch {
      return isoStr;
    }
  };

  return (
    <>
      <motion.tr
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, x: -80, transition: { duration: 0.3 } }}
        transition={{ delay: index * 0.04, duration: 0.35, ease: 'easeOut' }}
        layout
        onClick={handleClick}
        className={`
          group relative cursor-pointer
          border-b border-green-500/5
          ${deleting ? 'opacity-30 pointer-events-none' : ''}
          transition-all duration-200 hover:bg-green-500/[0.02]
        `}
      >
        {/* DEVICE column — icon + hostname + IP */}
        <td className="px-4 py-3 whitespace-nowrap">
          <div className="flex items-center gap-3">
            <div className={`relative flex-shrink-0 ${isOnline ? 'text-green-400' : 'text-slate-600'}`}>
              <DeviceIcon hostname={device.hostname} os={device.os_name} size={32} />
              <span className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-slate-900 ${isOnline ? 'bg-green-400' : 'bg-slate-600'}`} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate max-w-[180px]">
                {device.hostname || 'Unknown'}
              </p>
              <p className="text-xs text-slate-500 font-mono truncate">{device.ip}</p>
            </div>
          </div>
        </td>

        {/* OS column */}
        <td className="px-4 py-3 whitespace-nowrap">
          <span className="inline-flex items-center gap-1.5 text-sm text-slate-300">
            <DeviceIcon hostname={device.hostname} os={device.os_name} size={16} className="text-slate-500 flex-shrink-0" />
            <span className="truncate max-w-[140px]">{device.os_name || 'Unknown'}</span>
          </span>
        </td>

        {/* STATUS column */}
        <td className="px-4 py-3 whitespace-nowrap">
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-0.5 rounded-full 
            ${isOnline 
              ? 'text-green-300 bg-green-400/10 border border-green-400/20' 
              : 'text-slate-500 bg-slate-500/10 border border-slate-500/20'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-green-400' : 'bg-slate-500'}`} />
            {isOnline ? 'Online' : 'Offline'}
          </span>
        </td>

        {/* LAST SEEN column — hidden on small screens */}
        <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-500 font-mono hidden md:table-cell">
          {relativeTime(device.last_seen)}
        </td>

        {/* ACTIONS column */}
        <td className="px-4 py-3 whitespace-nowrap text-right">
          <button
            onClick={handleDeleteClick}
            disabled={deleting}
            title="Remove device"
            className="p-1.5 rounded-md text-slate-600 hover:text-red-400 hover:bg-red-400/10 transition-colors opacity-0 group-hover:opacity-100"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </td>
      </motion.tr>

      {showDelete && (
        <DeviceDeleteDialog
          deviceId={device.id}
          hostname={device.hostname}
          deviceOs={device.os_name}
          onConfirm={handleConfirmDelete}
          onCancel={() => setShowDelete(false)}
        />
      )}
    </>
  );
};

export default DeviceRow;