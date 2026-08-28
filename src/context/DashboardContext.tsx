import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE } from '../utils/api';
import { computeDeviceTotals } from '../utils/normalize';

interface DashboardCtx {
  data: any | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  lastUpdated: Date | null;
  scopeDeviceId: string | null;
}

const Ctx = createContext<DashboardCtx>({
  data: null, loading: true, error: null, refresh: () => {}, lastUpdated: null, scopeDeviceId: null,
});
export const useDashboard = () => useContext(Ctx);

const POLL_MS = 5000;

interface ProviderProps {
  children: React.ReactNode;
  /** Target Node from the header. null = ALL EYES STAT (whole system). */
  deviceId?: string | null;
}

export const DashboardProvider: React.FC<ProviderProps> = ({ children, deviceId = null }) => {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const scopeDeviceId = deviceId || null;

  /**
   * The backend emits series as [{ t, v }]. Every chart component expects
   * { labels: [], values: [] }. Normalising here fixes all charts at once
   * instead of each component guessing a shape.
   */
  const toLabelled = (series: any): { labels: string[]; values: number[] } => {
    const rows = Array.isArray(series) ? series : [];
    return {
      labels: rows.map((r: any) => String(r?.t ?? r?.label ?? '')),
      values: rows.map((r: any) => Number(r?.v ?? r?.value ?? 0) || 0),
    };
  };

  const normalizeCharts = useCallback((rawCharts: any) => {
    const c = rawCharts ?? {};
    const cpu = toLabelled(c.cpu);
    const ram = toLabelled(c.ram);
    const disk = toLabelled(c.disk);
    const alertsDaily = toLabelled(c.alerts);
    const securityDaily = toLabelled(c.security);
    return {
      ...c,
      cpu,
      ram,
      disk,
      // Security-score history rendered by ThreatChart.
      threat: securityDaily.labels.length ? securityDaily : { labels: [], values: [] },
      // Daily alert counts (totals) — severity split comes from alert_trend.
      alert_daily: alertsDaily,
      alert_trend: c.alert_trend ?? { labels: [], critical: [], high: [], medium: [], low: [] },
      traffic_24h: Array.isArray(c.traffic_24h) ? c.traffic_24h : [],
      protocols: Array.isArray(c.protocols) ? c.protocols : [],
      device_growth: c.device_growth ?? { labels: [], values: [] },
      online_trend: c.online_trend ?? { labels: [], online: [], offline: [] },
    };
  }, []);

  /** Maps ANY backend shape (nested or legacy flat keys) to one canonical shape. */
  const normalize = useCallback((raw: any): any => {
    if (!raw || typeof raw !== 'object') return raw;

    const list = Array.isArray(raw.devices?.list)
      ? raw.devices.list
      : Array.isArray(raw.devices)
        ? raw.devices
        : [];
    const totals = computeDeviceTotals(list);

    const legacyTotal = Number(raw.total_devices ?? raw.devices?.total ?? totals.total) || 0;
    const legacyOnline = Number(raw.online_devices ?? raw.devices?.online ?? totals.online) || 0;
    const legacyOffline = Number(raw.offline_devices ?? raw.devices?.offline ?? totals.offline) || 0;

    const alertsRaw = raw.alerts ?? {};
    const alertList = Array.isArray(alertsRaw.recent) ? alertsRaw.recent : [];

    return {
      ...raw,
      server_time: raw.server_time ?? raw.time ?? new Date().toISOString(),
      version: raw.version ?? '—',
      devices: {
        total: totals.total || legacyTotal,
        online: totals.online || legacyOnline,
        offline: totals.offline || legacyOffline,
        list: totals.list,
      },
      alerts: {
        total: Number(alertsRaw.total ?? alertList.length) || 0,
        open: Number(alertsRaw.open ?? alertsRaw.total ?? 0) || 0,
        critical: Number(alertsRaw.critical ?? 0) || 0,
        high: Number(alertsRaw.high ?? 0) || 0,
        medium: Number(alertsRaw.medium ?? 0) || 0,
        low: Number(alertsRaw.low ?? 0) || 0,
        recent: alertList,
      },
      security: raw.security ?? { score: null, status: 'collecting', message: 'Collecting telemetry' },
      threat: raw.threat ?? null,
      traffic: raw.traffic ?? {},
      live: raw.live ?? {},
      health: raw.health ?? {},
      server_health: raw.server_health ?? {},
      charts: normalizeCharts(raw.charts),
      risk_ranking: Array.isArray(raw.risk_ranking) ? raw.risk_ranking : [],
      auth: raw.auth ?? null,
      activity: Array.isArray(raw.activity) ? raw.activity : Array.isArray(raw.timeline) ? raw.timeline : [],
      footer: raw.footer ?? null,
    };
  }, [normalizeCharts]);

  const fetchData = useCallback(async () => {
    try {
      const suffix = scopeDeviceId ? `?device_id=${encodeURIComponent(scopeDeviceId)}` : '';
      const res = await fetch(`${API_BASE}/api/dashboard${suffix}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json();
      if (raw.error) throw new Error(raw.message || raw.error);
      setData(normalize(raw));
      setLastUpdated(new Date());
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'fetch failed');
    } finally {
      setLoading(false);
    }
  }, [normalize, scopeDeviceId]);

  useEffect(() => {
    fetchData();
    timer.current = setInterval(fetchData, POLL_MS);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [fetchData]);

  const refresh = useCallback(() => { setLoading(true); fetchData(); }, [fetchData]);

  return (
    <Ctx.Provider value={{ data, loading, error, refresh, lastUpdated, scopeDeviceId }}>
      {children}
    </Ctx.Provider>
  );
};