import { env } from '../config/env.js';
import { INITIAL_USERS } from '../data/seed.js';
import { store } from '../store/db.js';
import { User } from '../types.js';
import { hashPassword, verifyPassword } from './password.js';

export const PROJECT_MANAGER_ID = 'u-pm';

export function projectManagerEmail() {
  return (env.defaultProjectManagerEmail || 'robotlead1@careyu.ai').trim().toLowerCase();
}

export function isProjectManagerEmail(email: string) {
  return email.trim().toLowerCase() === projectManagerEmail();
}

function seedProjectManager(): User {
  const seed = INITIAL_USERS.find((user) => user.id === PROJECT_MANAGER_ID);
  const now = new Date().toISOString();
  if (seed) {
    return { ...seed, email: projectManagerEmail() };
  }
  return {
    id: PROJECT_MANAGER_ID,
    employee_id: 'CYA-004',
    name: 'Arivan',
    email: projectManagerEmail(),
    phone: '',
    role_id: 'r-pm',
    role_code: 'PROJECT_MANAGER',
    role_name: 'Project Manager',
    team_name: 'Projects Team',
    reporting_manager_id: 'u-ceo',
    status: 'ACTIVE',
    account_status: 'ACTIVE',
    email_verified: true,
    created_at: now,
    updated_at: now,
  };
}

export async function ensureProjectManagerAccount() {
  const email = projectManagerEmail();
  const pending = store.findPendingSignupByEmail(email);
  if (pending) store.deletePendingSignup(pending.id);

  const users = store.getUsers();
  const existing =
    users.find((user) => user.id === PROJECT_MANAGER_ID) ||
    users.find((user) => user.email.toLowerCase() === email);

  const passwordMatches = existing?.password_hash
    ? await verifyPassword(env.demoPassword, existing.password_hash)
    : false;
  const ready =
    existing &&
    existing.id === PROJECT_MANAGER_ID &&
    existing.name === 'Arivan' &&
    existing.role_code === 'PROJECT_MANAGER' &&
    existing.status === 'ACTIVE' &&
    existing.account_status === 'ACTIVE' &&
    existing.email_verified !== false &&
    !existing.invitation_code_hash &&
    existing.email.toLowerCase() === email &&
    passwordMatches;

  if (ready) return;

  const now = new Date().toISOString();
  const seed = seedProjectManager();
  const next: User = {
    ...seed,
    ...existing,
    id: PROJECT_MANAGER_ID,
    name: 'Arivan',
    email,
    role_id: 'r-pm',
    role_code: 'PROJECT_MANAGER',
    role_name: 'Project Manager',
    team_name: 'Projects Team',
    reporting_manager_id: existing?.reporting_manager_id || seed.reporting_manager_id || 'u-ceo',
    status: 'ACTIVE',
    account_status: 'ACTIVE',
    email_verified: true,
    password_hash: passwordMatches && existing?.password_hash
      ? existing.password_hash
      : await hashPassword(env.demoPassword),
    invitation_code_hash: undefined,
    invitation_created_at: undefined,
    invitation_expires_at: undefined,
    invitation_used_at: existing?.invitation_used_at || now,
    password_created_at: existing?.password_created_at || now,
    password_changed_at: now,
    updated_at: now,
  };
  delete next.team_id;
  delete next.team_lead_id;
  delete next.team_lead_name;

  const others = users.filter((user) => user.id !== PROJECT_MANAGER_ID && user.email.toLowerCase() !== email);
  const replaced = users.some((user) => user.id === PROJECT_MANAGER_ID);
  store.saveUsers(
    replaced
      ? users
          .filter((user) => user.id === PROJECT_MANAGER_ID || user.email.toLowerCase() !== email)
          .map((user) => (user.id === PROJECT_MANAGER_ID ? next : user))
      : [...others, next]
  );
  console.info('[auth] Project Manager direct-login account ready', { email, name: next.name, role: next.role_code });
}
