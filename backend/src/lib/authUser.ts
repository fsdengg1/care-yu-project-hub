import { env } from '../config/env.js';
import { store } from '../store/db.js';
import { User } from '../types.js';

export type AccountStatus =
  | 'INVITED'
  | 'INVITATION_VERIFIED'
  | 'PASSWORD_SETUP_REQUIRED'
  | 'ACTIVE'
  | 'DISABLED'
  | 'INVITATION_EXPIRED';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function extractEmailDomain(email: string): string | null {
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf('@');
  if (at <= 0 || at === normalized.length - 1) return null;
  return normalized.slice(at + 1);
}

export function isValidEmailFormat(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

export function isAllowedWorkEmail(email: string): boolean {
  if (!isValidEmailFormat(email)) return false;
  const domain = extractEmailDomain(email);
  if (!domain) return false;
  const allowed = env.allowedEmailDomains;
  if (!allowed.length) return true;
  return allowed.includes(domain);
}

export function effectiveAccountStatus(user: User): AccountStatus {
  if (user.status === 'INACTIVE') return 'DISABLED';
  if (user.account_status === 'DISABLED') return 'DISABLED';

  const lifecycle = user.account_status;
  if (!lifecycle || lifecycle === 'ACTIVE') return 'ACTIVE';

  if (user.invitation_used_at && user.password_hash) return 'ACTIVE';

  if (lifecycle === 'INVITED' || lifecycle === 'PASSWORD_SETUP_REQUIRED' || lifecycle === 'INVITATION_VERIFIED' || lifecycle === 'INVITATION_EXPIRED') {
    const expires = user.invitation_expires_at ? Date.parse(user.invitation_expires_at) : 0;
    if (!user.invitation_used_at && expires && expires < Date.now()) {
      return 'INVITATION_EXPIRED';
    }
    if (lifecycle === 'PASSWORD_SETUP_REQUIRED' || lifecycle === 'INVITATION_VERIFIED') return 'INVITATION_VERIFIED';
    return lifecycle === 'INVITATION_EXPIRED' ? 'INVITATION_EXPIRED' : 'INVITED';
  }

  return 'ACTIVE';
}

export function isFullyActivated(user: User): boolean {
  return user.status === 'ACTIVE' && effectiveAccountStatus(user) === 'ACTIVE';
}

export function needsInvitationLogin(user: User): boolean {
  const status = effectiveAccountStatus(user);
  return status === 'INVITED' || status === 'PASSWORD_SETUP_REQUIRED' || status === 'INVITATION_VERIFIED' || status === 'INVITATION_EXPIRED';
}

export function signupReportingManagerEmail() {
  return env.defaultReportingManagerEmail || 'robotlead1@careyu.ai';
}

export function resolveSignupReportingManager(): { ok: true; manager: User } | { ok: false; message: string } {
  const configuredEmail = signupReportingManagerEmail();
  const configured = store
    .getUsers()
    .find(
      (user) =>
        user.email.toLowerCase() === configuredEmail &&
        user.status === 'ACTIVE' &&
        effectiveAccountStatus(user) === 'ACTIVE'
    );

  if (!configured) {
    return {
      ok: false,
      message: 'Your account request was created, but no Reporting Manager is configured. Please contact Admin.',
    };
  }
  return { ok: true, manager: configured };
}

export function publicUser(user: User): User {
  const {
    password_hash: _passwordHash,
    email_verification_token_hash: _verifyHash,
    email_verification_expires_at: _verifyExp,
    password_reset_token_hash: _resetHash,
    password_reset_expires_at: _resetExp,
    password_reset_used_at: _resetUsed,
    invitation_code_hash: _inviteHash,
    ...safe
  } = user;

  const manager = user.reporting_manager_id ? store.findUserById(user.reporting_manager_id) : undefined;

  return {
    ...safe,
    account_status: effectiveAccountStatus(user),
    reporting_manager_name: manager?.name || user.reporting_manager_name,
    has_password: Boolean(user.password_hash),
  } as User & { has_password: boolean };
}
