export const API_BASE =
  (typeof import.meta !== 'undefined' &&
   import.meta.env &&
   (import.meta.env.VITE_API_BASE as string)) ||
  'http://100.104.145.118:5000';

/**
 * Fetch from the API base. Resolves relative paths against API_BASE.
 */
export async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  return fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });
}

/**
 * Quick shorthand for API_BASE + path.
 */
export const apiUrl = (path: string) => `${API_BASE}${path}`;