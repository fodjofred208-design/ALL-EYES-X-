import { describe, it, expect } from 'vitest';
import {
  sortDevices,
  deviceSortValue,
  deviceAlertCount,
  deviceLocation,
  defaultSortDir,
  type DeviceSortKey,
} from '../deviceSort';

/**
 * These exercise the real comparator the Devices table sorts with. The cases
 * below are the ones that silently break a table: counts compared as strings,
 * dates that fail to parse, and placeholder values that read as real data.
 */

const dev = (over: Record<string, unknown> = {}) => ({
  hostname: 'node',
  os_name: 'Linux',
  status: 'offline',
  last_seen: '',
  ...over,
});

describe('deviceAlertCount', () => {
  it('counts a real alert list', () => {
    expect(deviceAlertCount({ alerts: [{}, {}, {}] })).toBe(3);
  });

  it('treats a missing or non-list alerts field as zero, never as data', () => {
    expect(deviceAlertCount({})).toBe(0);
    expect(deviceAlertCount({ alerts: null })).toBe(0);
    expect(deviceAlertCount({ alerts: 'oops' })).toBe(0);
  });
});

describe('deviceLocation', () => {
  it('joins city and country', () => {
    expect(deviceLocation({ city: 'Douala', country: 'CM' })).toBe('Douala, CM');
  });

  it("drops the 'Unknown' placeholder geolocation writes on failure", () => {
    expect(deviceLocation({ city: 'Unknown', country: 'Unknown' })).toBe('');
    expect(deviceLocation({ city: 'Douala', country: 'Unknown' })).toBe('Douala');
    expect(deviceLocation({})).toBe('');
  });
});

describe('sortDevices', () => {
  it('sorts alert counts numerically, not as strings', () => {
    // As strings this order would be 10, 2, 9 - the classic table bug.
    const rows = [
      dev({ hostname: 'a', alerts: new Array(9).fill({}) }),
      dev({ hostname: 'b', alerts: new Array(10).fill({}) }),
      dev({ hostname: 'c', alerts: new Array(2).fill({}) }),
    ];
    expect(sortDevices(rows, 'alerts', 'desc').map(d => d.hostname)).toEqual(['b', 'a', 'c']);
    expect(sortDevices(rows, 'alerts', 'asc').map(d => d.hostname)).toEqual(['c', 'a', 'b']);
  });

  it('sorts last_seen by real time, newest first on desc', () => {
    const rows = [
      dev({ hostname: 'old', last_seen: '2026-01-01T00:00:00' }),
      dev({ hostname: 'new', last_seen: '2026-08-30T00:00:00' }),
      dev({ hostname: 'mid', last_seen: '2026-05-01T00:00:00' }),
    ];
    expect(sortDevices(rows, 'last_seen', 'desc').map(d => d.hostname))
      .toEqual(['new', 'mid', 'old']);
  });

  it('puts an unparseable last_seen last when sorting newest first', () => {
    const rows = [
      dev({ hostname: 'never', last_seen: '' }),
      dev({ hostname: 'seen', last_seen: '2026-08-30T00:00:00' }),
      dev({ hostname: 'junk', last_seen: 'not-a-date' }),
    ];
    const out = sortDevices(rows, 'last_seen', 'desc').map(d => d.hostname);
    expect(out[0]).toBe('seen');
    expect(out.slice(1).sort()).toEqual(['junk', 'never']);
  });

  it('sorts status with online above offline on desc', () => {
    const rows = [
      dev({ hostname: 'off', status: 'offline' }),
      dev({ hostname: 'on', status: 'online' }),
    ];
    expect(sortDevices(rows, 'status', 'desc').map(d => d.hostname)).toEqual(['on', 'off']);
  });

  it('sorts hostnames case-insensitively', () => {
    const rows = [dev({ hostname: 'beta' }), dev({ hostname: 'Alpha' }), dev({ hostname: 'gamma' })];
    expect(sortDevices(rows, 'hostname', 'asc').map(d => d.hostname))
      .toEqual(['Alpha', 'beta', 'gamma']);
  });

  it('does not mutate the array it was given', () => {
    const rows = [dev({ hostname: 'b' }), dev({ hostname: 'a' })];
    const before = rows.map(d => d.hostname);
    sortDevices(rows, 'hostname', 'asc');
    expect(rows.map(d => d.hostname)).toEqual(before);
  });

  it('reports the comparable value type per key', () => {
    expect(typeof deviceSortValue(dev({ alerts: [{}] }), 'alerts')).toBe('number');
    expect(typeof deviceSortValue(dev({ hostname: 'X' }), 'hostname')).toBe('string');
    expect(deviceSortValue(dev({ hostname: 'MiXeD' }), 'hostname')).toBe('mixed');
  });
});

describe('defaultSortDir', () => {
  it('reads naturally per column', () => {
    const expected: Array<[DeviceSortKey, 'asc' | 'desc']> = [
      ['hostname', 'asc'], ['os', 'asc'], ['location', 'asc'],
      ['alerts', 'desc'], ['status', 'desc'], ['last_seen', 'desc'], ['hardware', 'desc'],
    ];
    for (const [key, dir] of expected) {
      expect(defaultSortDir(key)).toBe(dir);
    }
  });
});
