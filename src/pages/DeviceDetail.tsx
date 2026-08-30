import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import DeviceIcon from '../components/DeviceIcon';

interface DetailData {
  device: Record<string, unknown>;
  operating_system: Record<string, unknown>;
  hardware: Record<string, unknown>;
  processor: Record<string, unknown>;
  memory: Record<string, unknown>;
  graphics: Array<Record<string, unknown>>;
  storage: Array<Record<string, unknown>>;
  network_interfaces: Array<Record<string, unknown>>;
  peripherals: Array<Record<string, unknown>>;
  preferences: Record<string, string>;
  telemetry?: Record<string, unknown>;
  software?: {
    installed_apps?: Array<{ name: string; version?: string }>;
    app_count?: number;
    user_files?: Array<{ name: string; path: string; kind: string; size: number }>;
    file_counts?: Record<string, number>;
    truncated?: boolean;
    updated_at?: string;
  };
}

const DeviceDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showSoftware, setShowSoftware] = useState(false);
  const [fileFilter, setFileFilter] = useState('all');

  useEffect(() => {
    if (!id) {
      setError('No device ID');
      setLoading(false);
      return;
    }

    const origin = window.location.origin;
    fetch(`${origin}/api/device/${id}/detail`, { credentials: 'include' })
      .then(r => {
        if (!r.ok) throw new Error(r.status === 404 ? 'Device not found' : `HTTP ${r.status}`);
        return r.json();
      })
      .then(j => { setData(j); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });

    // Live telemetry changes on every heartbeat, so keep the panel fresh.
    const t = setInterval(() => {
      fetch(`${window.location.origin}/api/device/${id}/detail`, { credentials: 'include' })
        .then(r => (r.ok ? r.json() : null))
        .then(j => { if (j) setData(j); })
        .catch(() => { /* keep last good data */ });
    }, 5000);
    return () => clearInterval(t);
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-green-400 border-t-transparent rounded-full" />
        <span className="ml-3 text-sm text-slate-400">Loading device details...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-white mb-1">Failed to load device</h2>
        <p className="text-sm text-slate-500 mb-4">{error}</p>
        <button
          onClick={() => navigate('/devices')}
          className="px-4 py-2 text-sm text-green-400 bg-green-400/10 rounded-lg hover:bg-green-400/20 transition-colors"
        >
          Back to Devices
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { device, operating_system, processor, memory, graphics, storage, network_interfaces, peripherals, telemetry, software } = data;
  const isOnline = device?.status === 'online';

  const Field: React.FC<{ label: string; value: string | number | null | undefined; mono?: boolean }> = ({ label, value, mono }) => (
    <div className="flex justify-between items-start gap-2 py-1.5 border-b border-slate-700/10 last:border-0">
      <span className="text-xs text-slate-600 font-medium uppercase tracking-wider">{label}</span>
      <span className={`text-sm text-slate-200 text-right max-w-[60%] truncate ${mono ? 'font-mono' : ''}`}>
        {value != null && value !== '' ? String(value) : <span className="text-slate-700 italic">N/A</span>}
      </span>
    </div>
  );

  const Card: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="rounded-xl border border-green-500/10 bg-slate-800/30 backdrop-blur-sm overflow-hidden"
    >
      <div className="px-5 py-3 border-b border-green-500/10">
        <h3 className="text-xs font-bold text-green-400 uppercase tracking-wider">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </motion.div>
  );

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
    } catch { return isoStr; }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/devices')}
          className="p-2 rounded-lg text-slate-500 hover:text-green-400 hover:bg-green-400/10 transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex items-center gap-3">
          <div className={`${isOnline ? 'text-green-400' : 'text-slate-600'}`}>
            <DeviceIcon hostname={String(device?.hostname || '')} os={String(operating_system?.os_name || '')} size={36} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">{String(device?.hostname || 'Unknown')}</h1>
            <p className="text-xs text-slate-500 font-mono">{id}</p>
          </div>
        </div>
        <span className={`ml-auto inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
          isOnline ? 'text-green-300 bg-green-400/10 border border-green-400/20' : 'text-slate-500 bg-slate-500/10 border border-slate-500/20'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-green-400' : 'bg-slate-500'}`} />
          {isOnline ? 'Online' : 'Offline'}
        </span>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

        {/* Identity */}
        <Card title="Device">
          <Field label="Hostname" value={String(device?.hostname || '')} />
          <Field label="IP" value={String(device?.ip || '')} mono />
          <Field label="MAC" value={String(device?.mac || '')} mono />
          <Field label="Public IP" value={String(device?.public_ip || '')} mono />
          <Field label="Location" value={device?.city && device?.country ? `${device.city}, ${device.country}` : null} />
          <Field label="Last Seen" value={relativeTime(String(device?.last_seen || ''))} />
          <Field label="Status" value={isOnline ? 'Online' : 'Offline'} />
          <Field label="Agent Version" value={String(device?.agent_version || '')} mono />
        </Card>

        {/* OS */}
        <Card title="Operating System">
          <Field label="OS" value={String(operating_system?.os_name || device?.os || '')} />
          <Field label="Version" value={String(operating_system?.version || device?.os_version || '')} />
          <Field label="Edition" value={String(operating_system?.edition || '')} />
          <Field label="Architecture" value={String(operating_system?.architecture || device?.architecture || '')} />
          <Field label="Kernel" value={String(operating_system?.kernel_version || '')} />
          <Field label="Build" value={String(operating_system?.build_number || '')} />
          <Field label="Language" value={String(operating_system?.language || '')} />
          <Field label="Installed" value={String(operating_system?.install_date || '')} />
        </Card>

        {/* Virtualization - the agent checks DMI, systemd-detect-virt, the CPU
            hypervisor flag and Win32_ComputerSystem, so "Physical" here is a
            determination, not an assumption. */}
        <Card title="Virtualization">
          <Field
            label="Platform"
            value={device?.is_vm ? 'Virtual machine' : 'Physical machine'}
          />
          <Field label="Hypervisor" value={device?.is_vm ? String(device?.hypervisor || '') : null} />
          <div className="mt-3">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Detection Evidence</p>
            <p className="text-[11px] font-mono text-slate-400 break-words">
              {String(device?.vm_details || '') ||
                (device?.is_vm
                  ? 'Reported as virtual; no individual source recorded.'
                  : 'No virtualization signature found in DMI, CPU flags, systemd-detect-virt or Win32_ComputerSystem.')}
            </p>
          </div>
        </Card>

        {/* Processor */}
        <Card title="Processor">
          <Field label="Brand" value={String(processor?.brand || '')} />
          <Field label="Model" value={String(processor?.model || device?.cpu || '')} />
          <Field label="Cores" value={processor?.core_count != null ? Number(processor.core_count) : null} />
          <Field label="Threads" value={processor?.logical_threads != null ? Number(processor.logical_threads) : null} />
          <Field label="Clock Speed" value={String(processor?.clock_speed || '')} />
          <Field label="Usage" value={processor?.usage_percent != null ? `${Math.round(Number(processor.usage_percent))}%` : null} />
        </Card>

        {/* Memory */}
        <Card title="Memory">
          <Field label="Total" value={memory?.total_gb != null ? `${Number(memory.total_gb).toFixed(1)} GB` : null} />
          <Field label="Available" value={memory?.available_gb != null ? `${Number(memory.available_gb).toFixed(1)} GB` : null} />
          <Field label="Speed" value={String(memory?.speed || '')} />
          <Field label="Type" value={String(memory?.memory_type || '')} />
          <Field label="Slots Used" value={memory?.slots_used != null ? Number(memory.slots_used) : null} />
          <Field label="Usage" value={memory?.usage_percent != null ? `${Math.round(Number(memory.usage_percent))}%` : null} />
        </Card>

        {/* GPU */}
        <Card title="Graphics">
          {!graphics || graphics.length === 0 ? (
            <p className="text-xs text-slate-600 italic">No GPU data reported</p>
          ) : (
            graphics.map((gpu, i) => (
              <div key={i} className={i > 0 ? 'mt-3 pt-3 border-t border-slate-700/20' : ''}>
                <p className="text-sm font-medium text-white mb-1">{String(gpu.name || '')}</p>
                <Field label="Manufacturer" value={String(gpu.manufacturer || '')} />
                <Field label="VRAM" value={String(gpu.dedicated_memory || '')} />
                <Field label="Driver" value={String(gpu.driver_version || '')} />
              </div>
            ))
          )}
        </Card>

        {/* Hardware */}
        <Card title="Hardware">
          <Field label="Manufacturer" value={String(data.hardware?.manufacturer || '')} />
          <Field label="Model" value={String(data.hardware?.model || '')} />
          <Field label="Motherboard" value={String(data.hardware?.motherboard || '')} />
          <Field label="BIOS" value={String(data.hardware?.bios_version || '')} />
          <Field label="Serial" value={String(data.hardware?.serial_number || '')} />
        </Card>

      </div>

      {/* Storage — full width */}
      <Card title="Storage">
        {!storage || storage.length === 0 ? (
          <p className="text-xs text-slate-600 italic">No storage data reported</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {storage.map((disk, i) => (
              <div key={i} className="p-3 rounded-lg bg-slate-900/40 border border-slate-700/20">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium px-2 py-0.5 rounded text-green-300 bg-green-400/10">
                    {String(disk.drive_type || 'HDD')}
                  </span>
                  <span className="text-sm font-medium text-white truncate">{String(disk.name || '')}</span>
                </div>
                <Field label="Capacity" value={String(disk.capacity || '')} />
                <Field label="Used" value={String(disk.used || '')} />
                <Field label="Free" value={String(disk.free || '')} />
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Network — full width */}
      <Card title="Network Interfaces">
        {!network_interfaces || network_interfaces.length === 0 ? (
          <p className="text-xs text-slate-600 italic">No network data reported</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {network_interfaces.map((net, i) => (
              <div key={i} className="p-3 rounded-lg bg-slate-900/40 border border-slate-700/20">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-2 h-2 rounded-full ${net.status === 'up' ? 'bg-green-400' : 'bg-slate-600'}`} />
                  <span className="text-sm font-medium text-white">{String(net.name || '')}</span>
                </div>
                <Field label="IPv4" value={String(net.ipv4 || '')} mono />
                <Field label="MAC" value={String(net.mac || '')} mono />
                <Field label="Speed" value={String(net.speed || '')} />
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Live telemetry — real values from the heartbeat table */}
      <Card title="Live Telemetry & Security">
        {!telemetry || telemetry.updated_at == null ? (
          <p className="text-xs text-slate-600 italic">
            No telemetry reported yet — waiting for the agent's next heartbeat.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { l: 'CPU Usage', v: telemetry.cpu },
                { l: 'RAM Usage', v: telemetry.ram },
                { l: 'Disk Usage', v: telemetry.disk },
              ].map(m => {
                const pct = Number(m.v ?? 0);
                return (
                  <div key={m.l} className="p-3 rounded-lg bg-slate-900/40 border border-slate-700/20">
                    <div className="flex justify-between items-baseline">
                      <span className="text-[10px] uppercase tracking-wider text-slate-500">{m.l}</span>
                      <span className="text-sm font-mono text-green-400">{m.v == null ? 'N/A' : `${Math.round(pct)}%`}</span>
                    </div>
                    <div className="mt-2 h-1.5 bg-slate-700/30 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-green-500 transition-all duration-700"
                        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
              <Field label="Firewall" value={
                telemetry.firewall === 1 ? 'Enabled' : telemetry.firewall === 0 ? 'Disabled' : 'Not reported'
              } />
              <Field label="Antivirus" value={
                telemetry.antivirus === 1 ? 'Active' : telemetry.antivirus === 0 ? 'Inactive' : 'Not reported'
              } />
              <Field label="Logged User" value={telemetry.logged_user as string} />
              <Field label="Boot Time" value={telemetry.boot_time as string} />
              <Field label="GPU Summary" value={telemetry.gpu as string} />
              <Field label="Wi-Fi" value={
                telemetry.wifi ? JSON.stringify(telemetry.wifi) : ''
              } mono />
              <Field label="Battery" value={
                telemetry.battery == null || Number(telemetry.battery) < 0 ? '' : `${telemetry.battery}%`
              } />
              <Field label="Net Sent" value={
                telemetry.net_sent == null ? '' : `${(Number(telemetry.net_sent) / 1048576).toFixed(1)} MB`
              } mono />
              <Field label="Net Received" value={
                telemetry.net_recv == null ? '' : `${(Number(telemetry.net_recv) / 1048576).toFixed(1)} MB`
              } mono />
              <Field label="Malware Detected" value={telemetry.malware_detected ? 'YES' : 'No'} />
              <Field label="Open Ports" value={
                Array.isArray(telemetry.open_ports) && telemetry.open_ports.length
                  ? telemetry.open_ports.join(', ')
                  : 'None reported'
              } mono />
              <Field label="Last Heartbeat" value={telemetry.updated_at as string} mono />
            </div>
          </div>
        )}
      </Card>

      {/* Read More — installed apps, files, videos, media */}
      <Card title="Read More — Software & Media">
        {!software || (!software.installed_apps?.length && !software.user_files?.length) ? (
          <p className="text-xs text-slate-600 italic">
            No software inventory reported yet. The agent uploads it on a slower cycle
            (default every 10 minutes) after it first registers.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-[11px] text-slate-400">
                {software.app_count ?? software.installed_apps?.length ?? 0} applications ·{' '}
                {Object.entries(software.file_counts ?? {})
                  .map(([k, v]) => `${v} ${k}`)
                  .join(' · ') || 'no media indexed'}
              </p>
              <button
                onClick={() => setShowSoftware(v => !v)}
                className="px-3 py-1.5 rounded-lg border border-green-500/30 bg-green-500/10 text-[10px] font-orbitron uppercase tracking-widest text-green-400 hover:bg-green-600 hover:text-white transition-all"
              >
                {showSoftware ? 'Hide details' : 'Read more'}
              </button>
            </div>

            {software.truncated && (
              <p className="text-[10px] font-mono-data text-amber-500/80">
                Listing truncated — the agent caps the scan so a large disk cannot flood the server.
              </p>
            )}

            {showSoftware && (
              <div className="space-y-4">
                {/* media filter */}
                <div className="flex flex-wrap gap-2">
                  {['all', 'video', 'image', 'audio', 'document'].map(k => (
                    <button
                      key={k}
                      onClick={() => setFileFilter(k)}
                      className={`px-3 py-1.5 rounded-lg border text-[9px] font-orbitron uppercase transition-all ${
                        fileFilter === k
                          ? 'border-green-500/50 bg-green-500/10 text-green-300'
                          : 'border-white/10 bg-white/5 text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {k}
                    </button>
                  ))}
                </div>

                {/* installed applications */}
                <div>
                  <p className="text-[10px] font-orbitron uppercase tracking-widest text-slate-500 mb-2">
                    Installed applications ({software.installed_apps?.length ?? 0})
                  </p>
                  <div className="max-h-64 overflow-y-auto aeyes-scroll space-y-1 pr-1">
                    {(software.installed_apps ?? []).map((a, i) => (
                      <div key={i} className="flex justify-between items-baseline gap-3 px-3 py-1.5 rounded bg-slate-900/40 border border-slate-700/20">
                        <span className="text-[11px] text-slate-300 truncate">{a.name}</span>
                        <span className="text-[10px] font-mono text-slate-600 shrink-0">{a.version || '—'}</span>
                      </div>
                    ))}
                    {!(software.installed_apps ?? []).length && (
                      <p className="text-[10px] font-mono-data text-slate-600 italic">No applications reported</p>
                    )}
                  </div>
                </div>

                {/* media & documents */}
                <div>
                  <p className="text-[10px] font-orbitron uppercase tracking-widest text-slate-500 mb-2">
                    Files in the user profile
                    {fileFilter !== 'all' && ` — ${fileFilter}`}
                  </p>
                  <div className="max-h-72 overflow-y-auto aeyes-scroll space-y-1 pr-1">
                    {(software.user_files ?? [])
                      .filter(f => fileFilter === 'all' || f.kind === fileFilter)
                      .map((f, i) => (
                        <div key={i} className="flex justify-between items-baseline gap-3 px-3 py-1.5 rounded bg-slate-900/40 border border-slate-700/20">
                          <span className="text-[11px] text-slate-300 truncate" title={f.path}>{f.name}</span>
                          <span className="text-[10px] font-mono text-slate-600 shrink-0">
                            {(f.size / 1048576).toFixed(1)} MB · {f.kind}
                          </span>
                        </div>
                      ))}
                    {!(software.user_files ?? []).filter(f => fileFilter === 'all' || f.kind === fileFilter).length && (
                      <p className="text-[10px] font-mono-data text-slate-600 italic">No matching files indexed</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Peripherals — full width */}
      <Card title="Peripherals">
        {!peripherals || peripherals.length === 0 ? (
          <p className="text-xs text-slate-600 italic">No peripheral data reported</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {peripherals.map((peri, i) => (
              <div key={i} className="p-3 rounded-lg bg-slate-900/40 border border-slate-700/20 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">{String(peri.name || '')}</p>
                  <p className="text-xs text-slate-500">{String(peri.manufacturer || '')}</p>
                </div>
                <span className="text-[10px] uppercase text-slate-600">{String(peri.connection_type || 'USB')}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

    </div>
  );
};

export default DeviceDetail;