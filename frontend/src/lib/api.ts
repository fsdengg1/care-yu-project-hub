export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string }> {
  try {
    const headers = new Headers(options.headers);
    if (!headers.has('Content-Type') && options.body) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        message: payload.message || 'Request failed. Please try again.',
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
