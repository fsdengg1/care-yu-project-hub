import { User } from './types';
import { apiRequest } from './api';
import { StorageService } from './storage';

export interface LoginFieldErrors {
  email?: string;
  password?: string;
}

export function validateLogin(email: string, password: string): LoginFieldErrors {
  const errors: LoginFieldErrors = {};
  const trimmed = email.trim();

  if (!trimmed) {
    errors.email = 'Work email is required.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    errors.email = 'Enter a valid work email address.';
  }

  if (!password) {
    errors.password = 'Password is required.';
  } else if (password.length < 8) {
    errors.password = 'Password must be at least 8 characters.';
  }

  return errors;
}

export async function loginWithApi(
  email: string,
  password: string
): Promise<{ ok: true; user: User; token: string } | { ok: false; error: string }> {
  const result = await apiRequest<{ user: User; token: string }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim(), password }),
  });

  if (!result.ok) {
    return { ok: false, error: result.message };
  }

  return { ok: true, user: result.data.user, token: result.data.token };
}

export async function ensureAuthSession(): Promise<boolean> {
  const user = StorageService.getCurrentUser();
  if (!user) return false;

  const existing = StorageService.getAuthToken();
  if (existing) {
    const me = await apiRequest<{ user: User }>('/api/auth/me');
    if (me.ok) return true;
  }

  const restored = await apiRequest<{ token: string; user: User }>('/api/auth/restore-session', {
    method: 'POST',
    body: JSON.stringify({ userId: user.id, email: user.email }),
  });
  if (!restored.ok) return false;

  const remember = Boolean(typeof window !== 'undefined' && localStorage.getItem('cya_current_user_v6'));
  StorageService.setAuthToken(restored.data.token, remember);
  StorageService.setCurrentUser(restored.data.user, remember);
  return true;
}

export function getDashboardPath(roleCode: string): string {
  switch (roleCode) {
    case 'CEO':
      return '/dashboard/ceo';
    case 'CTO':
      return '/dashboard/cto';
    case 'BUSINESS_HEAD':
      return '/dashboard/business-head';
    case 'ENG_DIRECTOR':
      return '/dashboard/engineering';
    case 'PROJECT_MANAGER':
    case 'PROJECT_ENGINEER':
      return '/dashboard/pm';
    case 'TEAM_LEAD':
      return '/dashboard/team-lead';
    case 'EMPLOYEE':
    case 'EXECUTION':
      return '/dashboard/team-member';
    default:
      return '/dashboard';
  }
}
