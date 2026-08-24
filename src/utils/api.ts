const normalizeBase = (value?: string | null): string => {
  if (!value) return '';
  return value.replace(/\/$/, '');
};

/**
 * Canonical browser-facing API base.
 *
 * Default is same-origin so Vite/Caddy can proxy /api and /socket.io.
 * Override only when intentionally connecting directly to a LAN/Tailscale API:
 *   VITE_API_BASE=http://100.x.y.z:5000
 */
export const API_BASE = normalizeBase(
  typeof import.meta !== 'undefined' && import.meta.env
    ? (import.meta.env.VITE_API_BASE as string | undefined)
    : undefined
);

export const SOCKET_URL = normalizeBase(
  typeof import.meta !== 'undefined' && import.meta.env
    ? ((import.meta.env.VITE_SOCKET_URL as string | undefined) || (import.meta.env.VITE_API_BASE as string | undefined))
    : undefined
);

export const apiUrl = (path: string): string => {
  if (path.startsWith('http')) return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${normalizedPath}`;
};

/**
 * Fetch JSON from the backend with credentials and consistent error handling.
 */
export async function apiFetch<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});

  const hasBody = options.body !== undefined && options.body !== null;
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (hasBody && !isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(apiUrl(path), {
    credentials: 'include',
    ...options,
    headers,
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text().catch(() => '');

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object'
        ? (payload.error || payload.message || `HTTP ${response.status}`)
        : (payload || `HTTP ${response.status}`);
    throw new Error(String(message));
  }

  return payload as T;
}
