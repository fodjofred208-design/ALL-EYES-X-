/**
 * ALL EYES X — device normalizer.
 * The backend may return devices with different key spellings
 * (id vs device_id, hostname vs name, os vs platform...).
 * This maps EVERYTHING to one canonical shape used by all components.
 */

export const normalizeDevice = (d: any): any => {
  if (!d || typeof d !== 'object') return d;
  const id = d.device_id ?? d.id ?? d.deviceId ?? `dev-${Math.random().toString(36).slice(2, 8)}`;
  const online =
    String(d.status ?? '').toLowerCase() === 'online' ||
    d.online === true ||
    d.is_online === true;
  const hostname = String(d.hostname ?? d.name ?? d.device_name ?? d.host ?? id);
  const lastSeen = d.last_seen ?? d.lastSeen ?? d.updated_at ?? d.heartbeat_at ?? d.timestamp ?? null;
  const risk = Number(d.risk ?? d.risk_score ?? d.threat_score ?? 0) || 0;
  const riskLevel =
    d.risk_level ??
    (risk >= 70 ? 'CRITICAL' : risk >= 40 ? 'HIGH' : risk >= 20 ? 'MEDIUM' : 'LOW');
  return {
    ...d,
    device_id: id,
    id,
    hostname,
    name: hostname,
    ip: d.ip ?? d.ip_address ?? d.local_ip ?? '—',
    os: d.os ?? d.platform ?? d.operating_system ?? d.system ?? '—',
    mac: d.mac ?? d.mac_address ?? '—',
    status: online ? 'online' : 'offline',
    online,
    risk,
    risk_level: riskLevel,
    last_seen: lastSeen,
    location:
      d.location ?? (d.country ? `${d.city ? d.city + ', ' : ''}${d.country}` : null),
    country: d.country ?? null,
    city: d.city ?? null,
  };
};

export const normalizeDevices = (list: any[]): any[] =>
  Array.isArray(list) ? list.map(normalizeDevice) : [];

/** Authoritative totals — computed from the actual device list when present. */
export const computeDeviceTotals = (list: any[]) => {
  const norm = normalizeDevices(list);
  return {
    total: norm.length,
    online: norm.filter((d: any) => d.online).length,
    offline: norm.filter((d: any) => !d.online).length,
    list: norm,
  };
};