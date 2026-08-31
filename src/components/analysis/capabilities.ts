/**
 * TELEMETRY CAPABILITY MATRIX — single source of truth for the Analysis page.
 *
 * Every module declares what it needs and what the system can actually provide
 * today. The UI reads this instead of hardcoding panels, so a module can never
 * render a chart for telemetry that does not exist. When a sensor is added,
 * flip `status` here and the module lights up.
 *
 * Statuses:
 *   'ready'    real telemetry exists; the module is fully functional
 *   'partial'  some telemetry exists; the module shows what it has and names
 *              what it cannot show
 *   'deferred' no sensor exists; the module renders an explicit
 *              "sensor not installed" state and never fabricates data
 */

export type ModuleStatus = 'ready' | 'partial' | 'deferred';

export type HistoryKind = 'none' | 'current' | 'historical';

export interface ModuleCapability {
  id: string;
  title: string;
  status: ModuleStatus;
  /** What the system genuinely has behind this module. */
  telemetry: string;
  /** Whether a time-range control is meaningful for this module. */
  history: HistoryKind;
  /** Only set when the module cannot work yet. */
  missing?: string;
  /** What becomes available once the missing sensor exists. */
  unlocks?: string;
}

export interface AnalysisCategory {
  id: string;
  index: string;
  title: string;
  subtitle: string;
  modules: ModuleCapability[];
}

export const ANALYSIS_CATEGORIES: AnalysisCategory[] = [
  {
    id: 'devices',
    index: '01',
    title: 'DEVICES ANALYSIS',
    subtitle: 'Endpoint intelligence and exposure per monitored device',
    modules: [
      {
        id: 'risk',
        title: 'Device Risk Ranking',
        status: 'ready',
        telemetry:
          'Derived from open ports, unresolved alerts by severity, firewall and antivirus state, malware indicators, suspicious processes, CVEs, disk encryption and agent liveness.',
        history: 'current',
      },
      {
        id: 'usb',
        title: 'USB Activity',
        status: 'partial',
        telemetry: 'Current USB devices reported by the agent (telemetry.usb_devices).',
        history: 'current',
        missing:
          'The agent reports a flat list of currently attached devices with no timestamps, so first-seen / last-seen and a connect/disconnect timeline cannot be shown.',
        unlocks:
          'Per-device first_seen / last_seen and a connection timeline once the agent reports attach and detach events.',
      },
      {
        id: 'discovery',
        title: 'Network Discovery',
        status: 'ready',
        telemetry: 'Authorized network scans recorded in security_scans.',
        history: 'historical',
      },
    ],
  },
  {
    id: 'ports',
    index: '02',
    title: 'PORT ANALYSIS',
    subtitle: 'Network exposure investigation',
    modules: [
      {
        id: 'nmap',
        title: 'Nmap Vulnerability Scanner',
        status: 'ready',
        telemetry: 'Authorized nmap scans run by the agent, stored in security_scans.',
        history: 'historical',
      },
      {
        id: 'openports',
        title: 'Open Port Monitor',
        status: 'partial',
        telemetry: 'Listening ports reported per device (telemetry.open_ports).',
        history: 'current',
        missing:
          'The agent reports port numbers only - no protocol (TCP/UDP) and no per-port state - so those columns cannot be filled from real data.',
        unlocks: 'Protocol and state per port once the agent reports socket details.',
      },
      {
        id: 'surface',
        title: 'Attack Surface Analysis',
        status: 'partial',
        telemetry: 'Aggregated from listening ports and device inventory.',
        history: 'current',
        missing:
          'There is no NAT / routing / firewall-rule telemetry, so internet-facing exposure cannot be determined. A private IP alone is not evidence of exposure, and none is inferred.',
        unlocks: 'True internet-facing classification once gateway and NAT data is collected.',
      },
    ],
  },
  {
    id: 'traffic',
    index: '03',
    title: 'TRAFFIC ANALYSIS',
    subtitle: 'Network behaviour and service distribution',
    modules: [
      {
        id: 'protocols',
        title: 'Protocol Statistics',
        status: 'partial',
        telemetry:
          'Distribution of listening services derived from reported ports (WELL_KNOWN_PORTS).',
        history: 'current',
        missing:
          'This is a listening-service breakdown, NOT traffic volume. There is no packet capture, so packet counts and byte counts per protocol do not exist.',
        unlocks: 'Real per-protocol packet and byte counts once a packet sensor is installed.',
      },
      {
        id: 'talkers',
        title: 'Top Network Talkers',
        status: 'partial',
        telemetry: 'Per-device upload/download counters sampled in traffic_samples.',
        history: 'historical',
        missing:
          'Counters are per device only - there is no per-connection data, so connection counts and per-device protocol breakdowns cannot be shown.',
        unlocks: 'Connection and protocol breakdowns once flow-level telemetry exists.',
      },
      {
        id: 'packets',
        title: 'Live Packet Analysis',
        status: 'deferred',
        telemetry: 'None.',
        history: 'none',
        missing:
          'No packet capture capability exists anywhere in the system. The agent does not open a capture socket and the backend stores no packets.',
        unlocks:
          'Per-packet timestamp, source, destination, protocol, ports, size and direction once a packet sensor is installed on the agent.',
      },
    ],
  },
  {
    id: 'topology',
    index: '04',
    title: 'TOPOLOGY ANALYSIS',
    subtitle: 'Network structure and threat geography',
    modules: [
      {
        id: 'topology',
        title: 'Network Topology',
        status: 'partial',
        telemetry: 'Monitored devices with IP, OS, status, risk and device-type hints.',
        history: 'current',
        missing:
          'Routers, switches and the internet gateway are not discovered - there is no ARP, routing-table or LLDP collection. Links between monitored hosts are therefore not known and are not drawn.',
        unlocks: 'Real infrastructure nodes and verified links once layer-2 discovery is added.',
      },
      {
        id: 'heatmap',
        title: 'Threat Heat Map',
        status: 'deferred',
        telemetry: 'None.',
        history: 'none',
        missing:
          'Devices carry latitude/longitude resolved from their own IP, but there is no attack-origin telemetry at all - no external source IPs, no connection events. Drawing arcs would mean inventing attack origins.',
        unlocks:
          'Origin-to-destination arcs with severity once external connection telemetry is collected.',
      },
    ],
  },
  {
    id: 'malware',
    index: '05',
    title: 'MALWARE ANALYSIS',
    subtitle: 'Endpoint security telemetry',
    modules: [
      {
        id: 'behavior',
        title: 'Malware Behavior',
        status: 'partial',
        telemetry:
          'Suspicious processes and the agent malware indicator (telemetry.suspicious_processes, telemetry.malware_detected).',
        history: 'current',
        missing:
          'No parent process, no timestamps and no persistence-mechanism collection, so a detection cannot be placed on a timeline or attributed to a parent.',
        unlocks:
          'Process lineage, timing and persistence detection once the agent reports them.',
      },
      {
        id: 'ioc',
        title: 'IOC Detection',
        status: 'deferred',
        telemetry: 'None.',
        history: 'none',
        missing:
          'There is no threat-intelligence integration (no VirusTotal, OTX, MISP or local indicator store) and no hash collection, so there is nothing to match against.',
        unlocks:
          'Indicator matches with source and confidence once a threat-intel feed is connected.',
      },
      {
        id: 'firewall',
        title: 'Firewall Analysis',
        status: 'partial',
        telemetry: 'Host firewall enabled/disabled per device (telemetry.firewall).',
        history: 'current',
        missing:
          'A single boolean is all that is collected. Active profiles, rule lists and allowed/blocked counts require the agent to read the firewall configuration.',
        unlocks:
          'Profile and rule detail plus allow/block counts once the agent reports firewall configuration.',
      },
      {
        id: 'advisor',
        title: 'AI Security Advisor',
        status: 'deferred',
        telemetry: 'None.',
        history: 'none',
        missing:
          'There is no model integration anywhere in the stack. Rendering generated recommendations would present inference as telemetry, which this system does not do.',
        unlocks:
          'Summary, observations and prioritised actions once an LLM is connected - clearly separated from observed facts.',
      },
    ],
  },
  {
    id: 'logs',
    index: '06',
    title: 'LOG ANALYSIS',
    subtitle: 'Sessions, events and detection rules',
    modules: [
      {
        id: 'sessions',
        title: 'Session Monitoring',
        status: 'partial',
        telemetry:
          'Remote-control sessions (remote_sessions) and dashboard authentication attempts (auth_attempts).',
        history: 'historical',
        missing:
          'These are NOT operating-system user logons. No agent collects OS logon events, so interactive user sessions cannot be listed.',
        unlocks: 'OS logon sessions once the agent collects security-event logs.',
      },
      {
        id: 'loganalyzer',
        title: 'Log Analyzer',
        status: 'deferred',
        telemetry: 'None stored.',
        history: 'none',
        missing:
          'Windows Event Log and syslog commands exist in the Terminal command set, but nothing collects or stores log events. There is no log table.',
        unlocks:
          'Timestamp, source, event id, severity, user and message search once a log collector ships.',
      },
      {
        id: 'sigma',
        title: 'Sigma Rule Detection',
        status: 'deferred',
        telemetry: 'None.',
        history: 'none',
        missing:
          'Sigma rules match against stored log events, and no log events are stored. This module depends on the Log Analyzer sensor.',
        unlocks: 'Rule matches with the reasoning behind each match, once logs are collected.',
      },
      {
        id: 'anomaly',
        title: 'AI Anomaly Detection',
        status: 'deferred',
        telemetry: 'None.',
        history: 'none',
        missing:
          'Per-device telemetry is a single row overwritten on every heartbeat, so there is no history to baseline against. Anomaly detection also needs a model.',
        unlocks:
          'Baseline, current behaviour, deviation and confidence once time-series telemetry and a model exist.',
      },
    ],
  },
];

export const ALL_MODULES: ModuleCapability[] = ANALYSIS_CATEGORIES.flatMap(c => c.modules);

export const findModule = (id: string): ModuleCapability | undefined =>
  ALL_MODULES.find(m => m.id === id);

/** Human label for a module's data state, shown in its header. */
export const dataStateLabel = (m: ModuleCapability): string => {
  if (m.status === 'deferred') return 'SENSOR NOT INSTALLED';
  return m.history === 'historical' ? 'HISTORICAL' : 'LIVE / CURRENT STATE';
};

/**
 * Whether a time-range control is meaningful. Only modules with real historical
 * storage get one; everything else is current state and says so.
 */
export const supportsTimeRange = (m: ModuleCapability): boolean => m.history === 'historical';

export const isDeferred = (m: ModuleCapability): boolean => m.status === 'deferred';
