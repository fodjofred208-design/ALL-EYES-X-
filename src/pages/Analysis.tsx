import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, ExternalLink, Map, Radar } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { useDevices } from '../context/DeviceContext';
import { useDashboard } from '../context/DashboardContext';
import { usePolling } from '../hooks/usePolling';
import { API_BASE } from '../utils/api';
import AnalysisSection, { type SummaryStat } from '../components/analysis/AnalysisSection';
import SensorRequired from '../components/analysis/SensorRequired';
import {
  ANALYSIS_CATEGORIES,
  findModule,
  isDeferred,
  dataStateLabel,
} from '../components/analysis/capabilities';
import NmapScanner from '../components/analysis/NmapScanner';
import NetworkDiscovery from '../components/analysis/NetworkDiscovery';
import DeviceDeepDive from '../components/analysis/DeviceDeepDive';
import { ConnectionAnalysis } from '../components/analysis/NetworkSensors';
import LogAnalyzer from '../components/analysis/LogAnalyzer';
import SigmaDetection from '../components/analysis/SigmaDetection';
import IOCDetection from '../components/analysis/IOCDetection';
import ThreatHeatMap from '../components/analysis/ThreatHeatMap';
import {
  RiskRankingModule,
  OpenPortsModule,
  AttackSurfaceModule,
  EndpointSecurityModule,
  ProtocolStatistics,
  TopTalkersModule,
  SessionsModule,
  FleetCompositionModule,
} from '../components/analysis/modules';

/**
 * ANALYSIS — the investigative workspace.
 *
 * Command Center answers "what is the state of my system?". This page answers
 * "why is it in that state, and what is happening underneath it?".
 *
 * Every module is driven by capabilities.ts. Where the system has real telemetry
 * the module renders it; where a sensor does not exist the module renders an
 * explicit "sensor not installed" state. Nothing here fabricates data, and no
 * panel shows a zero where the truth is "unknown".
 */

const j = async (path: string) => {
  const res = await fetch(`${API_BASE}${path}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

const Analysis: React.FC = () => {
  const navigate = useNavigate();
  const { devices } = useDevices();
  const { data: dash } = useDashboard();

  const [risk, setRisk] = useState<any>(null);
  const [endpoints, setEndpoints] = useState<any>(null);
  const [talkers, setTalkers] = useState<any>(null);
  const [sessions, setSessions] = useState<any>(null);
  const [scans, setScans] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters. Only controls that do something real are offered - there is no
  // global time range because most telemetry is current state, not history.
  const [deviceId, setDeviceId] = useState('all');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const scope = deviceId && deviceId !== 'all' ? `?device_id=${encodeURIComponent(deviceId)}` : '';
      const [r, e, t, s, n, an] = await Promise.all([
        j(`/api/analysis/devices${scope}`),
        j(`/api/analysis/endpoints${scope}`),
        j('/api/analysis/talkers'),
        j('/api/analysis/sessions'),
        j('/api/security/nmap/scans'),
        j('/api/analytics'),
      ]);
      setRisk(r); setEndpoints(e); setTalkers(t); setSessions(s);
      setAnalytics(an);
      setScans(Array.isArray(n?.scans) ? n.scans : []);
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? 'fetch failed');
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  usePolling(load, 10000);

  const q = search.trim().toLowerCase();
  const riskDevices = useMemo(() => {
    const list = risk?.devices ?? [];
    return q
      ? list.filter((d: any) =>
          String(d.hostname).toLowerCase().includes(q) || String(d.ip).includes(q))
      : list;
  }, [risk, q]);

  const endpointDevices = useMemo(() => {
    const list = endpoints?.devices ?? [];
    return q
      ? list.filter((d: any) =>
          String(d.hostname).toLowerCase().includes(q) || String(d.ip).includes(q))
      : list;
  }, [endpoints, q]);

  const protocols = dash?.protocols ?? [];
  const counts = risk?.counts ?? { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };

  const deviceStats: SummaryStat[] = [
    { label: 'Devices', value: risk?.total ?? 0 },
    { label: 'Critical', value: counts.CRITICAL, tone: 'critical' },
    { label: 'High', value: counts.HIGH, tone: 'high' },
    { label: 'Medium', value: counts.MEDIUM, tone: 'medium' },
  ];
  const portStats: SummaryStat[] = [
    { label: 'Listening Ports', value: endpoints?.total_ports ?? 0 },
    { label: 'High-Risk Ports', value: endpoints?.total_high_risk ?? 0, tone: endpoints?.total_high_risk ? 'high' : 'low' },
    { label: 'Devices Reporting', value: endpoints?.devices_with_telemetry ?? 0 },
    { label: 'Scans Recorded', value: scans.length },
  ];
  const trafficStats: SummaryStat[] = [
    { label: 'Services Seen', value: protocols.length },
    { label: 'Talkers', value: talkers?.total ?? 0 },
    { label: 'Packet Sensor', value: 'OFFLINE', tone: 'medium' },
  ];
  const malwareStats: SummaryStat[] = [
    {
      label: 'Suspicious Processes',
      value: endpointDevices.reduce((s: number, d: any) => s + (d.suspicious_processes?.length ?? 0), 0),
      tone: 'high',
    },
    {
      label: 'Malware Flags',
      value: endpointDevices.filter((d: any) => d.malware_detected).length,
      tone: 'critical',
    },
    {
      label: 'Firewall Off',
      value: endpointDevices.filter((d: any) => d.firewall === 0).length,
      tone: 'high',
    },
  ];
  const logStats: SummaryStat[] = [
    { label: 'Remote Sessions', value: sessions?.remote_control_sessions?.length ?? 0 },
    { label: 'Active Now', value: sessions?.active_remote ?? 0, tone: 'low' },
    { label: 'Failed Logins', value: sessions?.failed_logins ?? 0, tone: 'high' },
  ];

  /** Reuse-by-link block for capabilities that already live elsewhere. */
  const ReuseLink: React.FC<{ to: string; icon: React.ReactNode; label: string; note: string }> = ({
    to, icon, label, note,
  }) => (
    <button
      onClick={() => navigate(to)}
      className="w-full text-left rounded-lg border border-green-500/20 bg-green-500/[0.04] hover:bg-green-500/10 transition-colors px-4 py-3 flex items-start gap-3"
    >
      <span className="text-green-400 shrink-0 mt-0.5">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-[11px] font-orbitron uppercase tracking-[0.16em] text-green-300">
          {label} <ExternalLink size={11} />
        </span>
        <span className="block mt-1 text-[10px] font-mono-data text-slate-500 leading-relaxed">{note}</span>
      </span>
    </button>
  );

  const cat = (id: string) => ANALYSIS_CATEGORIES.find(c => c.id === id)!;
  const deferred = (id: string) => <SensorRequired module={findModule(id)!} />;
  const stateFor = (ids: string[]) => {
    if (ids.every(id => isDeferred(findModule(id)!))) return 'SENSOR NOT INSTALLED';
    if (ids.some(id => !isDeferred(findModule(id)!))) return 'LIVE / CURRENT STATE';
    return 'PARTIAL';
  };

  return (
    <div className="space-y-6">
      {/* ---------------- HEADER ---------------- */}
      <PageHeader
        size="hero"
        hideBack
        title="ANALYSIS"
        subtitle="Advanced Network & Security Intelligence"
        right={
          <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-[9px] font-orbitron uppercase tracking-[0.18em] ${
            error ? 'border-red-500/30 text-red-400 bg-red-500/10'
                  : 'border-green-500/25 text-green-400 bg-green-500/[0.07]'}`}>
            <motion.span
              className={`w-1.5 h-1.5 rounded-full ${error ? 'bg-red-400' : 'bg-green-400'}`}
              animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 2, repeat: Infinity }} />
            {error ? 'ANALYSIS ENGINE UNAVAILABLE' : 'LIVE'}
          </span>
        }
      />

      {/* ---------------- FILTER BAR ---------------- */}
      <div className="glass-card px-4 py-3 flex flex-col md:flex-row md:items-center gap-3">
        <label className="flex items-center gap-2 text-[9px] font-orbitron uppercase tracking-[0.16em] text-slate-500">
          Device
          <select
            value={deviceId}
            onChange={e => setDeviceId(e.target.value)}
            className="bg-slate-900/60 border border-white/10 rounded px-2 py-1.5 text-[10px] font-mono-data text-slate-200 normal-case tracking-normal"
          >
            <option value="all">All Devices</option>
            {devices.map(d => (
              <option key={d.id} value={d.id}>{d.hostname}</option>
            ))}
          </select>
        </label>

        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search host or IP..."
            className="w-full pl-9 pr-3 py-1.5 bg-slate-900/60 border border-white/10 rounded text-[11px] font-mono-data text-slate-200 placeholder-slate-600 focus:outline-none focus:border-green-500/40"
          />
        </div>

        <p className="text-[9px] font-mono-data text-slate-600 md:text-right">
          Time ranges appear only on modules with real historical storage.
        </p>
      </div>

      {loading && (
        <div className="glass-card p-6 text-center text-[10px] font-orbitron uppercase tracking-[0.2em] text-slate-500">
          Collecting telemetry...
        </div>
      )}

      {/* ---------------- 01 DEVICES ---------------- */}
      <AnalysisSection category={cat('devices')} stats={deviceStats}
        state={stateFor(['risk', 'usb', 'discovery'])} live={!error}>
        <div>
          <h3 className="text-[10px] font-orbitron uppercase tracking-[0.18em] text-slate-400 mb-2">
            Device Risk Ranking · {dataStateLabel(findModule('risk')!)}
          </h3>
          <RiskRankingModule devices={riskDevices} />
        </div>
        <div>
          <h3 className="text-[10px] font-orbitron uppercase tracking-[0.18em] text-slate-400 mb-2">
            USB Activity · {dataStateLabel(findModule('usb')!)}
          </h3>
          <EndpointSecurityModule devices={endpointDevices} />
        </div>
        <div>
          <h3 className="text-[10px] font-orbitron uppercase tracking-[0.18em] text-slate-400 mb-2">
            Device Deep Dive · per-device charts · Live / Current State
          </h3>
          <DeviceDeepDive devices={devices} />
        </div>
        <div>
          <h3 className="text-[10px] font-orbitron uppercase tracking-[0.18em] text-slate-400 mb-2">
            Fleet Composition · Activity, OS and location
          </h3>
          <FleetCompositionModule analytics={analytics} />
        </div>
        <div>
          <h3 className="text-[10px] font-orbitron uppercase tracking-[0.18em] text-slate-400 mb-2">
            Network Discovery · {dataStateLabel(findModule('discovery')!)}
          </h3>
          <NetworkDiscovery />
        </div>
      </AnalysisSection>

      {/* ---------------- 02 PORTS ---------------- */}
      <AnalysisSection category={cat('ports')} stats={portStats}
        state={stateFor(['nmap', 'openports', 'surface'])} live={!error}>
        <div>
          <h3 className="text-[10px] font-orbitron uppercase tracking-[0.18em] text-slate-400 mb-2">
            Nmap Vulnerability Scanner · {scans.length} scan(s) recorded
          </h3>
          <NmapScanner />
          <p className="mt-2 text-[9px] font-mono-data text-slate-600">
            Scans are authorized network-analysis operations launched explicitly by an operator.
            An nmap result is a scan finding, never a confirmed vulnerability.
          </p>
        </div>
        <div>
          <h3 className="text-[10px] font-orbitron uppercase tracking-[0.18em] text-slate-400 mb-2">
            Open Port Monitor · {dataStateLabel(findModule('openports')!)}
          </h3>
          <OpenPortsModule devices={endpointDevices} />
        </div>
        <div>
          <h3 className="text-[10px] font-orbitron uppercase tracking-[0.18em] text-slate-400 mb-2">
            Attack Surface Analysis
          </h3>
          <AttackSurfaceModule endpoints={endpoints} />
        </div>
      </AnalysisSection>

      {/* ---------------- 03 TRAFFIC ---------------- */}
      <AnalysisSection category={cat('traffic')} stats={trafficStats}
        state="PARTIAL — PACKET SENSOR OFFLINE" live={!error}>
        <div className="relative overflow-hidden rounded-lg">
          {/* Decorative data-flow grid. Values below still come from the API. */}
          <span className="aeyes-traffic-grid" aria-hidden="true" />
          <div className="relative">
            <h3 className="text-[10px] font-orbitron uppercase tracking-[0.18em] text-slate-400 mb-2">
              Protocol Statistics · Listening Services
            </h3>
            <ProtocolStatistics protocols={protocols} />
          </div>
        </div>
        <div>
          <h3 className="text-[10px] font-orbitron uppercase tracking-[0.18em] text-slate-400 mb-2">
            Top Network Talkers · {dataStateLabel(findModule('talkers')!)}
          </h3>
          <TopTalkersModule talkers={talkers} />
        </div>
        <div>
          <h3 className="text-[10px] font-orbitron uppercase tracking-[0.18em] text-slate-400 mb-2">
            Live Connection Analysis · {dataStateLabel(findModule('packets')!)}
          </h3>
          <ConnectionAnalysis />
        </div>
      </AnalysisSection>

      {/* ---------------- 04 TOPOLOGY ---------------- */}
      <AnalysisSection category={cat('topology')} stats={[
        { label: 'Monitored Nodes', value: devices.length },
        { label: 'Online', value: devices.filter(d => d.status === 'online').length, tone: 'low' },
        { label: 'Infrastructure Map', value: 'PARTIAL', tone: 'medium' },
      ]} state="PARTIAL — NO ATTACK GEOGRAPHY" live={!error}>
        <div className="relative overflow-hidden rounded-lg">
          {/* Decorative radar rings, contained inside the panel. The panel itself
              never rotates. No data is implied by this animation. */}
          <span className="aeyes-topo-rings" aria-hidden="true" />
          <div className="relative">
        <ReuseLink to="/" icon={<Map size={14} />} label="Network Topology"
          note="The interactive topology map lives on the Command Center and is reused here rather than rebuilt. Infrastructure nodes (routers, switches, gateway) are not discovered - no ARP, routing-table or LLDP collection - so links between hosts are not drawn." />
          </div>
        </div>
        <div>
          <h3 className="text-[10px] font-orbitron uppercase tracking-[0.18em] text-slate-400 mb-2">
            Threat Geography · {dataStateLabel(findModule('heatmap')!)}
          </h3>
          <ThreatHeatMap />
        </div>
      </AnalysisSection>

      {/* ---------------- 05 MALWARE ---------------- */}
      <AnalysisSection category={cat('malware')} stats={malwareStats}
        state={stateFor(['behavior', 'ioc', 'firewall', 'advisor'])} live={!error}>
        <div>
          <h3 className="text-[10px] font-orbitron uppercase tracking-[0.18em] text-slate-400 mb-2">
            Malware Behavior &amp; Firewall · {dataStateLabel(findModule('behavior')!)}
          </h3>
          <EndpointSecurityModule devices={endpointDevices} />
        </div>
        <div>
          <h3 className="text-[10px] font-orbitron uppercase tracking-[0.18em] text-slate-400 mb-2">
            IOC Detection · {dataStateLabel(findModule('ioc')!)}
          </h3>
          <IOCDetection />
        </div>
        <div>
          <h3 className="text-[10px] font-orbitron uppercase tracking-[0.18em] text-slate-400 mb-2">AI Security Advisor</h3>
          {deferred('advisor')}
        </div>
      </AnalysisSection>

      {/* ---------------- 06 LOGS ---------------- */}
      <AnalysisSection category={cat('logs')} stats={logStats}
        state="PARTIAL — LOG SENSOR NOT INSTALLED" live={!error}>
        <div>
          <h3 className="text-[10px] font-orbitron uppercase tracking-[0.18em] text-slate-400 mb-2">
            Session Monitoring · {dataStateLabel(findModule('sessions')!)}
          </h3>
          <SessionsModule sessions={sessions} />
        </div>
        <div>
          <h3 className="text-[10px] font-orbitron uppercase tracking-[0.18em] text-slate-400 mb-2">
            Log Analyzer · {dataStateLabel(findModule('loganalyzer')!)}
          </h3>
          <LogAnalyzer />
        </div>
        <div>
          <h3 className="text-[10px] font-orbitron uppercase tracking-[0.18em] text-slate-400 mb-2">
            Sigma Rule Detection · {dataStateLabel(findModule('sigma')!)}
          </h3>
          <SigmaDetection />
        </div>
        <div>
          <h3 className="text-[10px] font-orbitron uppercase tracking-[0.18em] text-slate-400 mb-2">AI Anomaly Detection</h3>
          {deferred('anomaly')}
        </div>
      </AnalysisSection>
    </div>
  );
};

export default Analysis;
