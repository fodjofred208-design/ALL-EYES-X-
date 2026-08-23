export interface Device {
  id: string;
  hostname: string;
  ip: string;
  os_name: string;
  os_version: string;
  status: string;
  last_seen: string;

  cpu: string;
  ram: string;

  ram_total?: number;
  architecture?: string;
  mac?: string;
  public_ip?: string;
  country?: string;
  city?: string;
  registered_at?: string;
  connected?: number;
  sessions?: number;
  data_usage?: string;

  [key: string]: unknown;
}