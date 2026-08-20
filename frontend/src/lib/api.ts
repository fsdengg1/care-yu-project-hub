import { StorageService } from './storage';
import { User } from './types';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type ApiOptions = RequestInit & { retried?: boolean };

export async function apiRequest<T>(
  path: string,
  options: ApiOptions = {}
): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string }> {
  try {
    const headers = new Headers(options.headers);
    if (!headers.has('Content-Type') && options.body) {
      headers.set('Content-Type', 'application/json');
    }
    const token = StorageService.getAuthToken();
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const { retried, ...fetchOptions } = options;
    const response = await fetch(`${API_URL}${path}`, {
      ...fetchOptions,
      headers,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const shouldRestore =
        response.status === 401 &&
        !path.includes('/api/auth/login') &&
        !path.includes('/api/auth/restore-session') &&
        !path.includes('/api/auth/me') &&
        !retried;

      if (shouldRestore) {
        const user = StorageService.getCurrentUser();
        if (user) {
          const restored = await apiRequest<{ token: string; user: User }>('/api/auth/restore-session', {
            method: 'POST',
            body: JSON.stringify({ userId: user.id, email: user.email }),
          });
          if (restored.ok) {
            StorageService.setAuthToken(restored.data.token);
            return apiRequest<T>(path, { ...fetchOptions, retried: true });
          }
        }
      }

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
