/**
 * Sorting for the Devices inventory table.
 *
 * Kept out of the component so the comparison rules are unit-testable and so
 * the table cannot drift from them. Every value comes from the device record
 * the API already returns - nothing here invents a fallback that could read as
 * real data.
 */

export type DeviceSortKey =
  | 'hostname' | 'os' | 'hardware' | 'alerts' | 'status' | 'location' | 'last_seen';
export type DeviceSortDir = 'asc' | 'desc';

export interface SortableDevice {
  hostname?: string;
  os_name?: string;
  status?: string;
  last_seen?: string;
  cpu?: unknown;
  ram?: unknown;
  city?: unknown;
  country?: unknown;
  alerts?: unknown;
}

/** Number of alerts on a device. Anything that is not a list counts as zero. */
export const deviceAlertCount = (d: { alerts?: unknown }): number =>
  Array.isArray(d.alerts) ? d.alerts.length : 0;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Drop the placeholder 'Unknown' values geolocation writes when it fails. */
const meaningful = (v: unknown): string => {
  const s = str(v).trim();
  return s && s !== 'Unknown' ? s : '';
};

/** Location as 'City, Country', empty when neither resolved. */
export const deviceLocation = (d: SortableDevice): string =>
  [meaningful(d.city), meaningful(d.country)].filter(Boolean).join(', ');

/**
 * The comparable value for one sort key. Numbers sort numerically, everything
 * else as a lower-cased string so casing never reorders the table.
 */
export const deviceSortValue = (
  d: SortableDevice,
  key: DeviceSortKey,
): string | number => {
  switch (key) {
    case 'hostname': return (d.hostname || '').toLowerCase();
    case 'os': return (d.os_name || '').toLowerCase();
    case 'hardware': return `${str(d.cpu)} ${str(d.ram)}`.trim().toLowerCase();
    case 'location': return deviceLocation(d).toLowerCase();
    case 'alerts': return deviceAlertCount(d);
    // Online first when ascending, so 'desc' puts offline at the bottom.
    case 'status': return d.status === 'online' ? 1 : 0;
    case 'last_seen': {
      const t = Date.parse(d.last_seen || '');
      return Number.isFinite(t) ? t : 0;
    }
    default: return '';
  }
};

export const sortDevices = <T extends SortableDevice>(
  rows: readonly T[],
  key: DeviceSortKey,
  dir: DeviceSortDir,
): T[] =>
  [...rows].sort((a, b) => {
    const va = deviceSortValue(a, key);
    const vb = deviceSortValue(b, key);
    const cmp = typeof va === 'number' && typeof vb === 'number'
      ? va - vb
      : String(va).localeCompare(String(vb));
    return dir === 'asc' ? cmp : -cmp;
  });

/** Sensible first-click direction per column. */
export const defaultSortDir = (key: DeviceSortKey): DeviceSortDir =>
  key === 'hostname' || key === 'os' || key === 'location' ? 'asc' : 'desc';
