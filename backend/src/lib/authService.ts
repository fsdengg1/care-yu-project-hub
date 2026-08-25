import { env } from '../config/env.js';
import { store } from '../store/db.js';
import { User } from '../types.js';
import {
  effectiveAccountStatus,
  isAllowedWorkEmail,
  isFullyActivated,
  needsInvitationLogin,
  publicUser,
  resolveSignupReportingManager,
} from './authUser.js';
import { sendInvitationToManager, sendPasswordChangedEmail, sendPasswordResetEmail, sendVerificationEmail, sendWelcomeEmail } from './authEmails.js';
import { newId } from './leadWorkflow.js';
import { hashPassword, validatePasswordPolicy, verifyPassword } from './password.js';
import {
  generateInvitationCode,
  generateSecureToken,
  hashInvitationCode,
  hashToken,
  invitationCodesMatch,
  tokensMatch,
} from './tokens.js';

function nextEmployeeId(users: User[]) {
  const numbers = users
    .map((user) => Number(String(user.employee_id || '').replace(/\D/g, '')))
    .filter((value) => Number.isFinite(value));
  const next = (numbers.length ? Math.max(...numbers) : 100) + 1;
  return `CYA-${String(next).padStart(3, '0')}`;
}

function saveUser(user: User) {
  const users = store.getUsers();
  const index = users.findIndex((item) => item.id === user.id);
  if (index === -1) {
    users.unshift(user);
  } else {
    users[index] = user;
  }
  store.saveUsers(users);
}

function clearVerificationTokens(user: User): User {
  return {
    ...user,
    email_verification_token_hash: undefined,
    email_verification_expires_at: undefined,
  };
}

function clearResetTokens(user: User): User {
  return {
    ...user,
    password_reset_token_hash: undefined,
    password_reset_expires_at: undefined,
  };
}

function clearInvitationSecrets(user: User): User {
  return {
    ...user,
    invitation_code_hash: undefined,
    invitation_expires_at: undefined,
  };
}

function invitationExpiryDate() {
  return new Date(Date.now() + env.invitationTtlHours * 60 * 60 * 1000);
}

async function issueInvitation(user: User, _manager: User, employeeName: string, employeeEmail: string) {
  const resolved = resolveSignupReportingManager();
  if (!resolved.ok) {
    saveUser({
      ...user,
      account_status: 'INVITED',
      updated_at: new Date().toISOString(),
    });
    console.error('[auth] Invitation email skipped: reporting manager missing', { userId: user.id });
    return { user, emailSent: false };
  }
  const manager = resolved.manager;
  const invitationCode = generateInvitationCode();
  const now = new Date();
  const updated: User = {
    ...user,
    invitation_code_hash: hashInvitationCode(invitationCode),
    invitation_created_at: now.toISOString(),
    invitation_expires_at: invitationExpiryDate().toISOString(),
    invitation_used_at: undefined,
    account_status: 'INVITED',
    reporting_manager_id: manager.id,
    reporting_manager_name: manager.name,
    updated_at: now.toISOString(),
  };
  saveUser(updated);

  console.info('[auth] Invitation generated', {
    userId: updated.id,
    managerId: manager.id,
    managerEmail: manager.email,
  });

  let emailSent = true;
  try {
    const sent = await sendInvitationToManager({
      managerEmail: manager.email,
      managerName: manager.name,
      managerUserId: manager.id,
      employeeName,
      employeeEmail,
      invitationCode,
      expiresInHours: env.invitationTtlHours,
    });
    emailSent = sent.status === 'SENT';
    if (emailSent) {
      console.info('[auth] Invitation email sent', {
        userId: updated.id,
        managerId: manager.id,
        managerEmail: manager.email,
        deliveryMode: sent.deliveryMode,
        transactionId: sent.transactionId || undefined,
      });
    } else {
      console.error('[auth] Invitation email failed', {
        userId: updated.id,
        managerId: manager.id,
        managerEmail: manager.email,
        deliveryMode: sent.deliveryMode,
      });
    }
  } catch (error) {
    emailSent = false;
    console.error('[auth] Invitation email failed', {
      userId: updated.id,
      managerId: manager.id,
      managerEmail: manager.email,
      message: error instanceof Error ? error.message : 'unknown error',
    });
  }

  store.appendNotification({
    recipient_id: manager.id,
    type: 'SYSTEM',
    title: 'New account invitation',
    message: `${employeeName} (${employeeEmail}) requested a CareYu account. Share the invitation code from your email so they can complete first login.`,
    entity_type: 'USER',
    entity_id: updated.id,
    sender_id: updated.id,
  });

  return { user: updated, emailSent };
}

export async function signupUser(input: {
  name: string;
  email: string;
}): Promise<
  | {
      ok: true;
      message: string;
      email: string;
      deliveryMode?: string;
      emailSent: boolean;
      code?: string;
    }
  | { ok: false; status: number; message: string; code?: string }
> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();

  if (!name) return { ok: false, status: 400, message: 'Full name is required.' };
  if (name.length < 2) return { ok: false, status: 400, message: 'Please enter your full name.' };
  if (!email) return { ok: false, status: 400, message: 'Work email is required.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, status: 400, message: 'Please enter a valid work email address.' };
  }
  if (!isAllowedWorkEmail(email)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_EMAIL_DOMAIN',
      message: 'Please use your CareYu work email address.',
    };
  }

  const users = store.getUsers();
  const existing = users.find((user) => user.email.toLowerCase() === email);
  if (existing) {
    const status = effectiveAccountStatus(existing);
    if (needsInvitationLogin(existing)) {
      return {
        ok: false,
        status: 409,
        code: 'PENDING_SIGNUP',
        message: 'Your account request is already pending invitation verification.',
      };
    }
    if (status === 'ACTIVE') {
      return {
        ok: false,
        status: 409,
        code: 'DUPLICATE_EMAIL',
        message: 'This work email is already registered. Please sign in.',
      };
    }
    return {
      ok: false,
      status: 409,
      code: 'DUPLICATE_EMAIL',
      message: 'This work email is already registered. Please sign in.',
    };
  }

  const managerResult = resolveSignupReportingManager();
  if (!managerResult.ok) {
    console.error('[auth] Signup blocked: no reporting manager', { email });
    return { ok: false, status: 409, code: 'MANAGER_MISSING', message: managerResult.message };
  }

  const roles = store.getRoles();
  const role = roles.find((item) => item.code === 'EMPLOYEE') || roles[0];
  if (!role) return { ok: false, status: 500, message: 'Unable to create your account right now. Please try again.' };

  const now = new Date();
  const user: User = {
    id: newId('u'),
    employee_id: nextEmployeeId(users),
    name,
    email,
    phone: '',
    role_id: role.id,
    role_code: role.code,
    role_name: role.name,
    status: 'ACTIVE',
    account_status: 'INVITED',
    reporting_manager_id: managerResult.manager.id,
    reporting_manager_name: managerResult.manager.name,
    email_verified: false,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };

  saveUser(user);
  console.info('[auth] Signup created', { userId: user.id, managerId: managerResult.manager.id });
  const issued = await issueInvitation(user, managerResult.manager, name, email);

  store.appendAudit({
    user_id: user.id,
    user_name: user.name,
    user_role: user.role_name,
    entity_type: 'AUTH',
    entity_id: user.id,
    entity_name: user.name,
    action: 'USER_SIGNUP',
    description: `${user.name} requested an account. Invitation sent to reporting manager ${managerResult.manager.name}.`,
  });

  return {
    ok: true,
    email: issued.user.email,
    message: issued.emailSent
      ? 'Account request created successfully.'
      : 'Your account request was created, but we could not send the invitation notification. Please contact Admin.',
    deliveryMode: env.emailProvider,
    emailSent: issued.emailSent,
    code: issued.emailSent ? undefined : 'EMAIL_DELIVERY_FAILED',
  };
}

export function lookupLoginMode(emailRaw: string): { loginMode: 'password' | 'invitation' } {
  const email = emailRaw.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { loginMode: 'password' };
  }
  const user = store.findUserByEmail(email);
  if (!user) return { loginMode: 'password' };
  if (needsInvitationLogin(user)) return { loginMode: 'invitation' };
  return { loginMode: 'password' };
}

export async function invitationLogin(input: {
  email: string;
  invitationCode: string;
}): Promise<
  | { ok: true; user: User }
  | { ok: false; status: number; message: string; code?: string }
> {
  const email = input.email.trim().toLowerCase();
  const code = input.invitationCode.trim();

  if (!email) return { ok: false, status: 400, message: 'Work email is required.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, status: 400, message: 'Enter a valid work email address.' };
  }
  if (!code) return { ok: false, status: 400, message: 'Invitation code is required.' };

  const user = store.findUserByEmail(email);
  if (!user) {
    return {
      ok: false,
      status: 401,
      code: 'INVITATION_INVALID',
      message: 'Invalid invitation code. Please check the code shared by your Reporting Manager.',
    };
  }

  if (user.status === 'INACTIVE' || effectiveAccountStatus(user) === 'DISABLED') {
    return { ok: false, status: 403, message: 'This account is inactive. Contact Admin for assistance.' };
  }

  if (user.invitation_used_at || (isFullyActivated(user) && user.password_hash)) {
    return {
      ok: false,
      status: 409,
      code: 'INVITATION_USED',
      message: 'This invitation code has already been used. Please sign in using your password.',
    };
  }

  if (!needsInvitationLogin(user)) {
    return {
      ok: false,
      status: 409,
      code: 'INVITATION_USED',
      message: 'This invitation code has already been used. Please sign in using your password.',
    };
  }

  const status = effectiveAccountStatus(user);
  if (status === 'INVITATION_EXPIRED') {
    return {
      ok: false,
      status: 400,
      code: 'INVITATION_EXPIRED',
      message: 'Your invitation code has expired. Please contact your Reporting Manager.',
    };
  }

  if (!invitationCodesMatch(code, user.invitation_code_hash)) {
    return {
      ok: false,
      status: 401,
      code: 'INVITATION_INVALID',
      message: 'Invalid invitation code. Please check the code shared by your Reporting Manager.',
    };
  }

  const expiresAt = user.invitation_expires_at ? Date.parse(user.invitation_expires_at) : 0;
  if (!expiresAt || expiresAt < Date.now()) {
    saveUser({ ...user, account_status: 'INVITATION_EXPIRED', updated_at: new Date().toISOString() });
    return {
      ok: false,
      status: 400,
      code: 'INVITATION_EXPIRED',
      message: 'Your invitation code has expired. Please contact your Reporting Manager.',
    };
  }

  const updated: User = {
    ...user,
    account_status: 'INVITATION_VERIFIED',
    updated_at: new Date().toISOString(),
  };
  saveUser(updated);

  store.appendAudit({
    user_id: updated.id,
    user_name: updated.name,
    user_role: updated.role_name,
    entity_type: 'AUTH',
    entity_id: updated.id,
    action: 'INVITATION_VERIFIED',
    description: `${updated.name} verified their invitation code and can create a password.`,
  });

  return { ok: true, user: publicUser(updated) as User };
}

export async function requestNewInvitation(emailRaw: string): Promise<
  | { ok: true; message: string; deliveryMode?: string; emailSent: boolean }
  | { ok: false; status: number; message: string; code?: string }
> {
  const email = emailRaw.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, status: 400, message: 'Please enter a valid work email address.' };
  }

  const user = store.findUserByEmail(email);
  if (!user || !needsInvitationLogin(user)) {
    if (user && (user.invitation_used_at || isFullyActivated(user))) {
      return {
        ok: false,
        status: 409,
        code: 'INVITATION_USED',
        message: 'This invitation code has already been used. Please sign in using your password.',
      };
    }
    return { ok: false, status: 404, message: 'No pending invitation was found for this email.' };
  }

  if (user.status === 'INACTIVE') {
    return { ok: false, status: 403, message: 'This account is inactive. Contact Admin for assistance.' };
  }

  const resolved = resolveSignupReportingManager();
  if (!resolved.ok) {
    return { ok: false, status: 409, code: 'manager_missing', message: resolved.message };
  }
  const manager = resolved.manager;

  const issued = await issueInvitation(user, manager, user.name, user.email);
  store.appendAudit({
    user_id: user.id,
    user_name: user.name,
    user_role: user.role_name,
    entity_type: 'AUTH',
    entity_id: user.id,
    action: 'INVITATION_REISSUED',
    description: `A new invitation code was issued for ${user.email} and sent to ${manager.name}.`,
  });

  return {
    ok: true,
    message: issued.emailSent
      ? 'Invitation notification sent successfully.'
      : 'Your account request was created, but we could not send the invitation notification. Please contact Admin.',
    deliveryMode: env.emailProvider,
    emailSent: issued.emailSent,
  };
}

export async function createAccountPassword(input: {
  user: User;
  newPassword: string;
  confirmPassword: string;
}): Promise<{ ok: true; message: string; user: User } | { ok: false; status: number; message: string }> {
  const fresh = store.findUserById(input.user.id);
  if (!fresh) return { ok: false, status: 401, message: 'Not authenticated.' };

  if (fresh.status === 'INACTIVE') {
    return { ok: false, status: 403, message: 'This account is inactive. Contact Admin for assistance.' };
  }

  if (fresh.invitation_used_at && fresh.password_hash) {
    return { ok: false, status: 409, message: 'This invitation code has already been used. Please sign in using your password.' };
  }

  const passwordError = validatePasswordPolicy(input.newPassword);
  if (passwordError) return { ok: false, status: 400, message: passwordError };
  if (input.newPassword !== input.confirmPassword) {
    return { ok: false, status: 400, message: 'Passwords do not match.' };
  }

  const now = new Date().toISOString();
  const updated: User = {
    ...clearInvitationSecrets(fresh),
    password_hash: await hashPassword(input.newPassword),
    password_created_at: now,
    password_changed_at: now,
    invitation_used_at: now,
    account_status: 'ACTIVE',
    email_verified: true,
    status: 'ACTIVE',
    updated_at: now,
  };
  saveUser(updated);

  store.appendAudit({
    user_id: updated.id,
    user_name: updated.name,
    user_role: updated.role_name,
    entity_type: 'AUTH',
    entity_id: updated.id,
    action: 'PASSWORD_CREATED',
    description: `${updated.name} created a password and activated their account.`,
  });

  console.info('[auth] Password created', { userId: updated.id });
  void sendWelcomeEmail({
    toEmail: updated.email,
    toName: updated.name,
    toUserId: updated.id,
  }).catch((error) => {
    console.error('[auth] Welcome email failed', {
      userId: updated.id,
      message: error instanceof Error ? error.message : 'unknown error',
    });
  });

  return {
    ok: true,
    message: 'Your password has been created successfully.',
    user: publicUser(updated) as User,
  };
}

export async function verifyEmailToken(
  token: string
): Promise<{ ok: true; message: string } | { ok: false; status: number; code: 'invalid' | 'expired'; message: string }> {
  if (!token) {
    return { ok: false, status: 400, code: 'invalid', message: 'This verification link is invalid.' };
  }

  const users = store.getUsers();
  const index = users.findIndex((user) => tokensMatch(token, user.email_verification_token_hash));
  if (index === -1) {
    return { ok: false, status: 400, code: 'invalid', message: 'This verification link is invalid or has already been used.' };
  }

  const user = users[index];
  const expiresAt = user.email_verification_expires_at ? Date.parse(user.email_verification_expires_at) : 0;
  if (!expiresAt || expiresAt < Date.now()) {
    return { ok: false, status: 400, code: 'expired', message: 'Your verification link has expired.' };
  }

  users[index] = {
    ...clearVerificationTokens(user),
    email_verified: true,
    updated_at: new Date().toISOString(),
  };
  store.saveUsers(users);
  store.appendAudit({
    user_id: user.id,
    user_name: user.name,
    user_role: user.role_name,
    entity_type: 'AUTH',
    entity_id: user.id,
    action: 'EMAIL_VERIFIED',
    description: `${user.name} verified their email address.`,
  });

  return { ok: true, message: 'Your email has been verified successfully.' };
}

export async function resendVerification(emailRaw: string): Promise<{
  ok: true;
  message: string;
  deliveryMode?: string;
  verifyUrl?: string;
}> {
  const email = emailRaw.trim().toLowerCase();
  const generic = {
    ok: true as const,
    message: 'If an unverified account exists for this email, a new verification link has been sent.',
  };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return generic;

  const user = store.findUserByEmail(email);
  if (!user || user.email_verified !== false || needsInvitationLogin(user)) return generic;

  const rawToken = generateSecureToken();
  const expires = new Date(Date.now() + env.emailVerificationTtlHours * 60 * 60 * 1000);
  const updated: User = {
    ...user,
    email_verification_token_hash: hashToken(rawToken),
    email_verification_expires_at: expires.toISOString(),
    updated_at: new Date().toISOString(),
  };
  saveUser(updated);

  const sent = await sendVerificationEmail({
    toEmail: updated.email,
    toName: updated.name,
    toUserId: updated.id,
    token: rawToken,
    expiresInHours: env.emailVerificationTtlHours,
  });

  const verifyUrl = `${env.frontendUrl}/verify-email?token=${encodeURIComponent(rawToken)}`;
  const deliveryMode = (sent as { deliveryMode?: string }).deliveryMode || env.emailProvider;

  return {
    ...generic,
    deliveryMode,
    ...(env.nodeEnv !== 'production' || deliveryMode === 'console' ? { verifyUrl } : {}),
  };
}

export async function authenticateLogin(input: {
  email: string;
  password: string;
}): Promise<
  | { ok: true; user: User }
  | { ok: false; status: number; message: string; code?: string }
> {
  const email = input.email.trim().toLowerCase();
  const user = store.findUserByEmail(email);

  if (!user) {
    return { ok: false, status: 401, message: 'Invalid email or password. Please try again.' };
  }

  if (user.status !== 'ACTIVE' || effectiveAccountStatus(user) === 'DISABLED') {
    return {
      ok: false,
      status: 403,
      code: 'ACCOUNT_INACTIVE',
      message: 'Your account is not active. Please contact Admin.',
    };
  }

  if (needsInvitationLogin(user)) {
    if (effectiveAccountStatus(user) === 'INVITATION_EXPIRED') {
      return {
        ok: false,
        status: 403,
        code: 'INVITATION_EXPIRED',
        message: 'Your invitation code has expired. Please contact your Reporting Manager.',
      };
    }
    return {
      ok: false,
      status: 403,
      code: 'ACCOUNT_PENDING',
      message: 'Your account is awaiting invitation verification.',
    };
  }

  let passwordOk = false;
  if (user.password_hash) {
    passwordOk = await verifyPassword(input.password, user.password_hash);
  } else if (input.password === env.demoPassword) {
    // Legacy seeded / admin-provisioned accounts until they set a personal password.
    passwordOk = true;
    const migrated: User = {
      ...user,
      password_hash: await hashPassword(input.password),
      email_verified: user.email_verified ?? true,
      account_status: 'ACTIVE',
      password_created_at: user.password_created_at || new Date().toISOString(),
      password_changed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    saveUser(migrated);
    return { ok: true, user: publicUser(migrated) as User };
  }

  if (!passwordOk) {
    return { ok: false, status: 401, message: 'Invalid email or password. Please try again.' };
  }

  if (user.email_verified === false) {
    return {
      ok: false,
      status: 403,
      code: 'unverified',
      message: 'Please verify your email before signing in. Check your inbox for the verification link.',
    };
  }

  return { ok: true, user: publicUser(user) as User };
}

export async function requestPasswordReset(emailRaw: string): Promise<{ message: string }> {
  const message =
    'If an account exists for this email address, a password reset link has been sent.';
  const email = emailRaw.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { message };
  }

  const user = store.findUserByEmail(email);
  if (!user || !isFullyActivated(user) || needsInvitationLogin(user)) {
    return { message };
  }

  const rawToken = generateSecureToken();
  const expires = new Date(Date.now() + env.passwordResetTtlMinutes * 60 * 1000);
  const updated: User = {
    ...clearResetTokens(user),
    password_reset_token_hash: hashToken(rawToken),
    password_reset_expires_at: expires.toISOString(),
    password_reset_used_at: undefined,
    updated_at: new Date().toISOString(),
  };
  saveUser(updated);

  await sendPasswordResetEmail({
    toEmail: updated.email,
    toName: updated.name,
    toUserId: updated.id,
    token: rawToken,
    expiresInMinutes: env.passwordResetTtlMinutes,
  });

  store.appendAudit({
    user_id: user.id,
    user_name: user.name,
    user_role: user.role_name,
    entity_type: 'AUTH',
    entity_id: user.id,
    action: 'PASSWORD_RESET_REQUESTED',
    description: `Password reset link requested for ${user.email}.`,
  });

  return { message };
}

export async function resetPasswordWithToken(input: {
  token: string;
  password: string;
  confirmPassword: string;
}): Promise<{ ok: true; message: string } | { ok: false; status: number; message: string }> {
  if (!input.token) {
    return { ok: false, status: 400, message: 'This password reset link is invalid or has expired.' };
  }

  const passwordError = validatePasswordPolicy(input.password);
  if (passwordError) return { ok: false, status: 400, message: passwordError };
  if (input.password !== input.confirmPassword) {
    return { ok: false, status: 400, message: 'Passwords do not match.' };
  }

  const users = store.getUsers();
  const index = users.findIndex((user) => tokensMatch(input.token, user.password_reset_token_hash));
  if (index === -1) {
    return { ok: false, status: 400, message: 'This password reset link is invalid or has expired.' };
  }

  const user = users[index];
  if (needsInvitationLogin(user) || !isFullyActivated(user)) {
    return { ok: false, status: 400, message: 'This password reset link is invalid or has expired.' };
  }
  if (user.password_reset_used_at) {
    return { ok: false, status: 400, message: 'This password reset link has already been used.' };
  }
  const expiresAt = user.password_reset_expires_at ? Date.parse(user.password_reset_expires_at) : 0;
  if (!expiresAt || expiresAt < Date.now()) {
    return { ok: false, status: 400, message: 'This password reset link is invalid or has expired.' };
  }

  const now = new Date().toISOString();
  users[index] = {
    ...clearResetTokens(user),
    password_hash: await hashPassword(input.password),
    password_reset_used_at: now,
    password_changed_at: now,
    password_created_at: user.password_created_at || now,
    email_verified: user.email_verified === false ? user.email_verified : true,
    updated_at: now,
  };
  store.saveUsers(users);

  store.appendAudit({
    user_id: user.id,
    user_name: user.name,
    user_role: user.role_name,
    entity_type: 'AUTH',
    entity_id: user.id,
    action: 'PASSWORD_RESET',
    description: `${user.name} reset their account password.`,
  });

  await sendPasswordChangedEmail({
    toEmail: user.email,
    toName: user.name,
    toUserId: user.id,
  });

  return { ok: true, message: 'Your password has been reset successfully.' };
}

export async function changePassword(input: {
  user: User;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<{ ok: true; message: string } | { ok: false; status: number; message: string }> {
  const fresh = store.findUserById(input.user.id);
  if (!fresh) return { ok: false, status: 401, message: 'Not authenticated.' };
  if (!isFullyActivated(fresh)) return { ok: false, status: 401, message: 'Not authenticated.' };

  let currentOk = false;
  if (fresh.password_hash) {
    currentOk = await verifyPassword(input.currentPassword, fresh.password_hash);
  } else {
    currentOk = input.currentPassword === env.demoPassword;
  }
  if (!currentOk) {
    return { ok: false, status: 400, message: 'Current password is incorrect.' };
  }

  const passwordError = validatePasswordPolicy(input.newPassword);
  if (passwordError) return { ok: false, status: 400, message: passwordError };
  if (input.newPassword !== input.confirmPassword) {
    return { ok: false, status: 400, message: 'Passwords do not match.' };
  }
  if (input.currentPassword === input.newPassword) {
    return { ok: false, status: 400, message: 'New password must be different from your current password.' };
  }

  const now = new Date().toISOString();
  const updated: User = {
    ...fresh,
    password_hash: await hashPassword(input.newPassword),
    password_created_at: fresh.password_created_at || now,
    password_changed_at: now,
    updated_at: now,
  };
  saveUser(updated);

  store.appendAudit({
    user_id: fresh.id,
    user_name: fresh.name,
    user_role: fresh.role_name,
    entity_type: 'AUTH',
    entity_id: fresh.id,
    action: 'PASSWORD_CHANGED',
    description: `${fresh.name} changed their account password.`,
  });

  await sendPasswordChangedEmail({
    toEmail: fresh.email,
    toName: fresh.name,
    toUserId: fresh.id,
  });

  return { ok: true, message: 'Your password has been updated successfully.' };
}
