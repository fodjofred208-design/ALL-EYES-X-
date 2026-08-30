import React, { useMemo, useState } from 'react';
import BackButton from '../components/BackButton';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useDevices } from '../context/DeviceContext';
import DeviceRow from '../components/DeviceRow';
import DeviceIcon from '../components/DeviceIcon';
import {
  sortDevices,
  defaultSortDir,
  deviceAlertCount,
  type DeviceSortKey,
  type DeviceSortDir,
} from '../utils/deviceSort';

type SortKey = DeviceSortKey;
type SortDir = DeviceSortDir;

const alertCount = deviceAlertCount;

const Devices: React.FC = () => {
  const { devices, loading, error, removeDevice, selectedDeviceId, setSelectedDeviceId } = useDevices();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('last_seen');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase();
    const rows = devices.filter(d => {
      const matchSearch = !q
        || d.hostname?.toLowerCase().includes(q)
        || d.ip?.includes(q)
        || d.id?.toLowerCase().includes(q)
        || (typeof d.cpu === 'string' && d.cpu.toLowerCase().includes(q))
        || (typeof d.city === 'string' && d.city.toLowerCase().includes(q));
      const matchStatus = statusFilter === 'all'
        || (statusFilter === 'online' ? d.status === 'online' : d.status !== 'online');
      return matchSearch && matchStatus;
    });

    return sortDevices(rows, sortKey, sortDir);
  }, [devices, searchTerm, statusFilter, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      // Newest first and Z-A first read better as the default for these columns.
      setSortDir(defaultSortDir(key));
    }
  };

  const handleViewDevice = (deviceId: string) => navigate(`/device/${deviceId}`);
  const handleSelectTarget = (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    const d = devices.find(x => x.id === deviceId);
    setActionMsg({ type: 'success', text: `Target Node set to ${d?.hostname ?? deviceId}` });
    setTimeout(() => setActionMsg(null), 3500);
  };
  const handleDelete = async (deviceId: string): Promise<boolean> => {
    const ok = await removeDevice(deviceId);
    setActionMsg(ok ? { type: 'success', text: 'Device removed' } : { type: 'error', text: 'Delete failed' });
    setTimeout(() => setActionMsg(null), 3500);
    return ok;
  };

  const onlineCount = devices.filter(d => d.status === 'online').length;
  const offlineCount = devices.filter(d => d.status !== 'online').length;
  const totalAlerts = devices.reduce((n, d) => n + alertCount(d), 0);

  if (loading && devices.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-green-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error && devices.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <p className="text-slate-400 text-sm">Failed to load devices</p>
        <p className="text-slate-600 text-xs mt-1">{error}</p>
      </div>
    );
  }

  const Th: React.FC<{ label: string; sort: SortKey; className?: string }> = ({ label, sort, className = '' }) => (
    <th className={`px-4 py-3 text-left text-xs font-bold text-green-400 uppercase tracking-wider ${className}`}>
      <button
        onClick={() => toggleSort(sort)}
        className="inline-flex items-center gap-1 hover:text-green-300 transition-colors"
        title={`Sort by ${label.toLowerCase()}`}
      >
        {label}
        <span className={`text-[9px] ${sortKey === sort ? 'text-green-300' : 'text-green-400/25'}`}>
          {sortKey === sort ? (sortDir === 'asc' ? '\u25B2' : '\u25BC') : '\u25C7'}
        </span>
      </button>
    </th>
  );

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <BackButton />
          <h2 className="text-xl font-bold text-green-400 uppercase tracking-wider">Devices Inventory</h2>
          <p className="text-sm text-slate-500">
            {devices.length} total &middot; {onlineCount} online &middot; {offlineCount} offline
            {totalAlerts > 0 && <> &middot; <span className="text-amber-400">{totalAlerts} alert{totalAlerts === 1 ? '' : 's'}</span></>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/')}
            className="px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800/50 border border-slate-700/30 rounded-lg hover:bg-slate-700/50 transition-colors"
          >
            Dashboard
          </button>
        </div>
      </div>

      {/* FILTERS */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search by hostname, IP, ID, CPU, or city..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm bg-slate-800/50 border border-slate-700/30 rounded-lg text-slate-200 placeholder-slate-700 focus:outline-none focus:border-green-500/50 focus:ring-1 focus:ring-green-500/20 transition-colors"
          />
        </div>
        <div className="flex gap-1.5">
          {(['all', 'online', 'offline'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-2 text-xs font-medium rounded-lg capitalize transition-colors ${
                statusFilter === s
                  ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                  : 'text-slate-500 bg-slate-800/30 border border-slate-700/30 hover:bg-slate-700/30'
              }`}
            >
              {s === 'all' ? `All (${devices.length})` : `${s} (${s === 'online' ? onlineCount : offlineCount})`}
            </button>
          ))}
        </div>
      </div>

      {actionMsg && (
        <div className={`px-4 py-2.5 rounded-lg text-xs font-medium border ${
          actionMsg.type === 'success'
            ? 'text-green-300 bg-green-400/10 border-green-400/20'
            : 'text-red-300 bg-red-400/10 border-red-400/20'
        }`}>
          {actionMsg.text}
        </div>
      )}

      {/* EMPTY STATES */}
      {filtered.length === 0 && devices.length > 0 && (
        <div className="text-center py-12">
          <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-slate-800/50 border border-slate-700/30 flex items-center justify-center text-slate-600">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
          <p className="text-sm text-slate-500">No devices match your search</p>
          <button onClick={() => { setSearchTerm(''); setStatusFilter('all'); }} className="mt-2 text-xs text-green-400 hover:text-green-300 transition-colors">
            Clear filters
          </button>
        </div>
      )}

      {devices.length === 0 && (
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-800/50 border border-slate-700/30 flex items-center justify-center text-slate-600">
            <DeviceIcon hostname="" os="" size={36} />
          </div>
          <p className="text-base font-medium text-slate-300 mb-1">No devices connected</p>
          <p className="text-sm text-slate-600">Deploy the client agent on target machines</p>
        </div>
      )}

      {/* TABLE */}
      {filtered.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-green-500/10 bg-slate-800/20 backdrop-blur-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-green-500/10">
                  <Th label="Device" sort="hostname" />
                  <Th label="OS" sort="os" />
                  <Th label="Hardware" sort="hardware" className="hidden xl:table-cell" />
                  <Th label="Alerts" sort="alerts" className="hidden md:table-cell" />
                  <Th label="Status" sort="status" />
                  <Th label="Location" sort="location" className="hidden lg:table-cell" />
                  <Th label="Last Seen" sort="last_seen" className="hidden md:table-cell" />
                  <th className="px-4 py-3 text-right text-xs font-bold text-green-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-green-500/5">
                <AnimatePresence mode="popLayout">
                  {filtered.map((device, i) => (
                    <DeviceRow
                      key={device.id}
                      device={device}
                      index={i}
                      onDelete={handleDelete}
                      onClick={handleViewDevice}
                      onSelectTarget={handleSelectTarget}
                      isTarget={device.id === selectedDeviceId}
                    />
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
          <p className="px-4 py-2 text-[10px] text-slate-600 border-t border-green-500/5">
            Click a column header to sort &middot; hover a row for Target Node and remove
          </p>
        </div>
      )}
    </div>
  );
};

export default Devices;
