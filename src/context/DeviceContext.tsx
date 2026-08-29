import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { apiFetch } from '../utils/api';
import { normalizeDevices } from '../utils/normalize';
import { usePolling } from '../hooks/usePolling';

interface Device {
  id: string;
  hostname: string;
  ip: string;
  os_name: string;
  os?: string;
  os_version: string;
  status: string;
  last_seen: string;
  cpu: string;
  ram: string;
  ram_total: number;
  architecture: string;
  mac: string;
  public_ip: string;
  country: string;
  city: string;
  registered_at: string;
  connected: number;
  sessions: number;
  data_usage: string;
  alerts?: unknown[];
  [key: string]: unknown;
}

interface DeviceContextType {
  devices: Device[];
  loading: boolean;
  error: string;

  // Added to fix the TypeScript errors
  selectedDevice: Device | null;
  selectedDeviceId: string | null;
  setSelectedDeviceId: React.Dispatch<
    React.SetStateAction<string | null>
  >;

  refreshDevices: () => Promise<void>;
  removeDevice: (deviceId: string) => Promise<boolean>;
  fetchDeviceDetail: (
    deviceId: string
  ) => Promise<Record<string, unknown>>;
  getPreference: (
    deviceId: string,
    key: string
  ) => Promise<string | null>;
  setPreference: (
    deviceId: string,
    key: string,
    value: string
  ) => Promise<boolean>;
}

const DeviceContext = createContext<DeviceContextType | null>(null);

export const useDevices = (): DeviceContextType => {
  const ctx = useContext(DeviceContext);

  if (!ctx) {
    throw new Error('useDevices must be used within DeviceProvider');
  }

  return ctx;
};

export const DeviceProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Added
  const [selectedDeviceId, setSelectedDeviceId] =
    useState<string | null>(null);

  const fetchDevices = useCallback(async () => {
    try {
      const json = await apiFetch<any>('/api/devices');

      const rawList = Array.isArray(json)
        ? json
        : Array.isArray(json.devices)
          ? json.devices
          : Array.isArray(json.devices?.list)
            ? json.devices.list
            : Array.isArray(json.list)
              ? json.list
              : [];

      const list = normalizeDevices(rawList).map((d: any) => ({
        ...d,
        os_name: d.os_name || d.os || 'Unknown',
        os_version: d.os_version || '',
        cpu: d.cpu || 'Unknown',
        ram: d.ram || 'Unknown',
        ram_total: Number(d.ram_total || 0),
        architecture: d.architecture || '',
        mac: d.mac || '',
        public_ip: d.public_ip || '',
        country: d.country || 'Unknown',
        city: d.city || 'Unknown',
        registered_at: d.registered_at || '',
        connected: d.online ? 1 : 0,
        sessions: Number(d.sessions || 0),
        data_usage: d.data_usage || '0 MB',
      })) as Device[];

      setDevices(list);

      setError('');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to fetch devices'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // Pauses while the tab is hidden — this is the highest-traffic poller.
  usePolling(fetchDevices, 5000);

  const refreshDevices = useCallback(async () => {
    setLoading(true);
    await fetchDevices();
  }, [fetchDevices]);

  const removeDevice = useCallback(
    async (deviceId: string): Promise<boolean> => {
      try {
        const origin = window.location.origin;

        const res = await fetch(
          `${origin}/api/device/${deviceId}/remove`,
          {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );

        if (!res.ok) {
          const errData = await res
            .json()
            .catch(() => ({}));

          throw new Error(
            errData.error || `HTTP ${res.status}`
          );
        }

        setDevices((prev) =>
          prev.filter((d) => d.id !== deviceId)
        );

        return true;
      } catch (err) {
        console.error('Remove device error:', err);
        return false;
      }
    },
    []
  );

  const fetchDeviceDetail = useCallback(
    async (
      deviceId: string
    ): Promise<Record<string, unknown>> => {
      const origin = window.location.origin;

      const res = await fetch(
        `${origin}/api/device/${deviceId}/detail`,
        {
          credentials: 'include',
        }
      );

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      return await res.json();
    },
    []
  );

  const getPreference = useCallback(
    async (
      deviceId: string,
      key: string
    ): Promise<string | null> => {
      try {
        const origin = window.location.origin;

        const res = await fetch(
          `${origin}/api/device/${deviceId}/preference?key=${encodeURIComponent(
            key
          )}`,
          {
            credentials: 'include',
          }
        );

        if (!res.ok) {
          return null;
        }

        const data = await res.json();

        return data.value ?? null;
      } catch {
        return null;
      }
    },
    []
  );

  const setPreference = useCallback(
    async (
      deviceId: string,
      key: string,
      value: string
    ): Promise<boolean> => {
      try {
        const origin = window.location.origin;

        const res = await fetch(
          `${origin}/api/device/${deviceId}/preference`,
          {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              key,
              value,
            }),
          }
        );

        return res.ok;
      } catch {
        return false;
      }
    },
    []
  );

  // Added
  const selectedDevice =
    devices.find(
      (device) => device.id === selectedDeviceId
    ) ?? null;

  return (
    <DeviceContext.Provider
      value={{
        devices,
        loading,
        error,

        selectedDevice,
        selectedDeviceId,
        setSelectedDeviceId,

        refreshDevices,
        removeDevice,
        fetchDeviceDetail,
        getPreference,
        setPreference,
      }}
    >
      {children}
    </DeviceContext.Provider>
  );
};

export default DeviceContext;