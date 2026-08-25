import { StorageService } from './storage';

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string; code?: string }> {
  try {
    const headers = new Headers(options.headers);
    if (!headers.has('Content-Type') && options.body) {
      headers.set('Content-Type', 'application/json');
    }
    const token = StorageService.getAuthToken();
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const proxyDown =
        !payload.message &&
        (response.status === 502 ||
          response.status === 503 ||
          response.status === 504 ||
          ((response.headers.get('content-type') || '').includes('text/html') && response.status >= 500));
      return {
        ok: false,
        status: response.status,
        message: proxyDown
          ? 'Unable to reach the server. Please confirm the backend is running on port 4100.'
          : payload.message || 'Request failed. Please try again.',
        code: typeof payload.code === 'string' ? payload.code : undefined,
      };
    }

    return { ok: true, data: payload as T };
  } catch {
    return {
      ok: false,
      status: 0,
      message: 'Unable to reach the server. Please confirm the backend is running.',
    };
  }
}
