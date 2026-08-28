import { env } from '../config/env.js';
import { store } from '../store/db.js';
import { PendingSignup, User } from '../types.js';

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

export { isSmokeTestAccount } from './smokeTestAccounts.js';

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

/** Signup-only: invitation has not been used to access the app yet. */
export function isPendingSignupOnly(user: User): boolean {
  const status = effectiveAccountStatus(user);
  return status === 'INVITED' || status === 'INVITATION_EXPIRED';
}

export function pendingSignupToUser(pending: PendingSignup): User {
  return {
    id: pending.id,
    employee_id: pending.employee_id,
    name: pending.name,
    email: pending.email,
    phone: '',
    role_id: pending.role_id,
    role_code: pending.role_code,
    role_name: pending.role_name,
    status: 'ACTIVE',
    account_status: pending.invitation_verified_at ? 'INVITATION_VERIFIED' : 'INVITED',
    reporting_manager_id: pending.reporting_manager_id,
    reporting_manager_name: pending.reporting_manager_name,
    invitation_code_hash: pending.invitation_code_hash,
    invitation_created_at: pending.invitation_created_at,
    invitation_expires_at: pending.invitation_expires_at,
    email_verified: false,
    created_at: pending.created_at,
    updated_at: pending.updated_at,
  };
}

export function signupReportingManagerEmail() {
  return env.defaultReportingManagerEmail || 'robotlead1@careyu.ai';
}

export function resolveSignupReportingManager(): { ok: true; manager: User } | { ok: false; message: string } {
  const users = store.getUsers().filter((user) => user.status === 'ACTIVE' && effectiveAccountStatus(user) === 'ACTIVE');
  const configuredEmail = signupReportingManagerEmail();
  const configured = users.find((user) => user.email.toLowerCase() === configuredEmail);
  const fallback =
    configured ||
    users.find((user) => user.role_code === 'CEO') ||
    users.find((user) => user.role_code === 'ENG_DIRECTOR') ||
    users.find((user) => user.role_code === 'BUSINESS_HEAD') ||
    users[0];

  if (fallback) return { ok: true, manager: fallback };

  const notifyEmail = env.invitationNotifyEmails[0] || env.supportEmail || 'admin@careyu.ai';
  const now = new Date().toISOString();
  return {
    ok: true,
    manager: {
      id: 'system-invite',
      employee_id: '',
      name: 'CareYu Admin',
      email: notifyEmail,
      phone: '',
      role_id: '',
      role_code: 'CEO',
      role_name: 'Admin',
      status: 'ACTIVE',
      account_status: 'ACTIVE',
      created_at: now,
      updated_at: now,
    },
  };
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
