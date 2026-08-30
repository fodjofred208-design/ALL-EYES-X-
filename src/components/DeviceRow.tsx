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
  /** Mark this device as the header's Target Node. */
  onSelectTarget?: (deviceId: string) => void;
  /** True when this row is the current Target Node. */
  isTarget?: boolean;
}

const DeviceRow: React.FC<DeviceRowProps> = ({
  device, index, onDelete, onClick, onSelectTarget, isTarget = false,
}) => {
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isOnline = device.status === 'online';

  // Every field below already arrives in /api/devices. None of it is fetched
  // again here and none of it is invented - when the agent has not reported a
  // value the cell says so instead of guessing.
  const alerts = Array.isArray(device.alerts) ? device.alerts.length : 0;
  const criticals = Array.isArray(device.alerts)
    ? (device.alerts as Array<Record<string, unknown>>).filter(
        a => String(a?.severity ?? '').toLowerCase() === 'critical'
      ).length
    : 0;
  const cpu = typeof device.cpu === 'string' ? device.cpu.trim() : '';
  const ram = typeof device.ram === 'string' ? device.ram.trim() : '';
  const city = typeof device.city === 'string' ? device.city.trim() : '';
  const country = typeof device.country === 'string' ? device.country.trim() : '';
  const location = [city, country].filter(v => v && v !== 'Unknown').join(', ');
  const mac = typeof device.mac === 'string' ? device.mac : '';
  // The agent now sends a real OS identity; older agents only sent the platform
  // kind, so fall back to that rather than printing 'Unknown'.
  const osLabel = [device.os_name, device.os].find(
    v => typeof v === 'string' && v.trim() && v.trim() !== 'Unknown'
  ) as string | undefined;

  // Fleet-management fields, all reported by the agent itself.
  const isVm = Boolean(device.is_vm);
  const hypervisor = typeof device.hypervisor === 'string' ? device.hypervisor : '';
  const agentVersion = typeof device.agent_version === 'string' ? device.agent_version : '';
  const inventory = (device.inventory ?? null) as
    | { sections?: Record<string, boolean>; reported?: number; total?: number }
    | null;
  const reportedSections = inventory?.reported ?? 0;
  const totalSections = inventory?.total ?? 0;
  const missingSections = Object.entries(inventory?.sections ?? {})
    .filter(([, ok]) => !ok)
    .map(([name]) => name);

  const handleClick = () => {
    if (onClick && !deleting) onClick(device.id);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDelete(true);
  };

  const handleTargetClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onSelectTarget) onSelectTarget(device.id);
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
          ${isTarget ? 'bg-green-500/[0.05]' : ''}
          transition-all duration-200 hover:bg-green-500/[0.02]
        `}
      >
        {/* DEVICE column - icon + hostname + IP */}
        <td className="px-4 py-3 whitespace-nowrap">
          <div className="flex items-center gap-3">
            <div className={`relative flex-shrink-0 ${isOnline ? 'text-green-400' : 'text-slate-600'}`}>
              {/* Offline shows a neutral monitor; the moment the agent reports in,
                  the icon becomes the device's own operating system. */}
              <DeviceIcon hostname={device.hostname} os={osLabel} size={32} online={isOnline} />
              <span className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-slate-900 ${isOnline ? 'bg-green-400' : 'bg-slate-600'}`} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate max-w-[180px] flex items-center gap-1.5">
                {device.hostname || 'Unknown'}
                {isTarget && (
                  <span className="text-[8px] font-bold uppercase tracking-widest text-green-400 bg-green-400/10 border border-green-400/20 rounded px-1 py-px flex-shrink-0">
                    target
                  </span>
                )}
                {isVm && (
                  <span
                    className="text-[8px] font-bold uppercase tracking-widest text-cyan-300 bg-cyan-400/10 border border-cyan-400/20 rounded px-1 py-px flex-shrink-0"
                    title={hypervisor ? `Virtual machine — ${hypervisor}` : 'Virtual machine'}
                  >
                    {hypervisor ? `VM · ${hypervisor}` : 'VM'}
                  </span>
                )}
              </p>
              <p className="text-xs text-slate-500 font-mono truncate" title={mac || undefined}>
                {device.ip}
                {totalSections > 0 && (
                  <span
                    className={`ml-2 ${missingSections.length ? 'text-amber-400/80' : 'text-green-400/70'}`}
                    title={
                      missingSections.length
                        ? `Inventory ${reportedSections}/${totalSections} reported. Missing: ${missingSections.join(', ')}`
                        : `Inventory complete — all ${totalSections} sections reported`
                    }
                  >
                    {reportedSections}/{totalSections} inv
                  </span>
                )}
              </p>
            </div>
          </div>
        </td>

        {/* OS column */}
        <td className="px-4 py-3 whitespace-nowrap">
          <span className="inline-flex items-center gap-1.5 text-sm text-slate-300">
            <DeviceIcon hostname={device.hostname} os={osLabel} size={16} online={isOnline} className="text-slate-500 flex-shrink-0" />
            <span className={`truncate max-w-[140px] ${osLabel ? '' : 'text-slate-600 italic'}`}>
              {osLabel || 'Not reported'}
            </span>
          </span>
        </td>

        {/* HARDWARE column - reported CPU model and RAM capacity */}
        <td className="px-4 py-3 whitespace-nowrap hidden xl:table-cell">
          <p className="text-xs text-slate-300 truncate max-w-[190px]" title={cpu || undefined}>
            {cpu || 'Not reported'}
          </p>
          <p className="text-[11px] text-slate-500 font-mono">
            {ram || 'RAM unknown'}
          </p>
        </td>

        {/* ALERTS column - real count from this device's alert list */}
        <td className="px-4 py-3 whitespace-nowrap hidden md:table-cell">
          {alerts === 0 ? (
            <span className="text-xs text-slate-600">None</span>
          ) : (
            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${
              criticals > 0
                ? 'text-red-300 bg-red-400/10 border-red-400/20'
                : 'text-amber-300 bg-amber-400/10 border-amber-400/20'
            }`}>
              {alerts}
              {criticals > 0 && <span className="text-[9px] uppercase tracking-wide">{criticals} crit</span>}
            </span>
          )}
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

        {/* LOCATION column - only what geolocation actually resolved */}
        <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-500 hidden lg:table-cell">
          {location || <span className="text-slate-700">Unresolved</span>}
        </td>

        {/* LAST SEEN column - hidden on small screens */}
        <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-500 font-mono hidden md:table-cell">
          {relativeTime(device.last_seen)}
        </td>

        {/* AGENT column - which build is reporting, so a stale agent is visible */}
        <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-400 font-mono hidden xl:table-cell">
          {agentVersion || <span className="text-slate-700 italic">not reported</span>}
        </td>

        {/* ACTIONS column */}
        <td className="px-4 py-3 whitespace-nowrap text-right">
          <div className="inline-flex items-center gap-1">
            {onSelectTarget && (
              <button
                onClick={handleTargetClick}
                disabled={deleting || isTarget}
                title={isTarget ? 'Current Target Node' : 'Set as Target Node'}
                className={`p-1.5 rounded-md transition-colors ${
                  isTarget
                    ? 'text-green-400 cursor-default'
                    : 'text-slate-600 hover:text-green-400 hover:bg-green-400/10 opacity-0 group-hover:opacity-100'
                }`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
                </svg>
              </button>
            )}
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
          </div>
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
