import { env } from '../config/env.js';
import { INITIAL_USERS } from '../data/seed.js';
import { store } from '../store/db.js';
import { User } from '../types.js';
import { hashPassword, verifyPassword } from './password.js';

export const ROBOT_LEAD_ID = 'u-tl-rob';
const LEGACY_ROBOT_LEAD_ID = 'u-robotlead1';

export function robotLeadEmail() {
  const configured = (env.robotLeadEmail || 'robottech@careyu.ai').trim().toLowerCase();
  if (configured === 'robotlead1@careyu.ai') return 'robottech@careyu.ai';
  return configured;
}

export function isRobotLeadEmail(email: string) {
  return email.trim().toLowerCase() === robotLeadEmail();
}

function seedRobotLead(): User {
  const seed =
    INITIAL_USERS.find((user) => user.id === ROBOT_LEAD_ID) ||
    INITIAL_USERS.find((user) => user.email.toLowerCase() === robotLeadEmail());
  if (seed) return seed;
  const now = new Date().toISOString();
  return {
    id: ROBOT_LEAD_ID,
    employee_id: 'CYA-012',
    name: 'Aakash',
    email: robotLeadEmail(),
    phone: '',
    role_id: 'r-tl',
    role_code: 'TEAM_LEAD',
    role_name: 'Team Lead',
    team_id: 't-robotics',
    team_name: 'Robotics & Automation Solution Team',
    reporting_manager_id: 'u-pm',
    status: 'ACTIVE',
    account_status: 'ACTIVE',
    email_verified: true,
    created_at: now,
    updated_at: now,
  };
}

export async function ensureRobotLeadAccount() {
  const email = robotLeadEmail();
  const pending = store.findPendingSignupByEmail(email);
  if (pending) store.deletePendingSignup(pending.id);

  const users = store.getUsers();
  const existing =
    users.find((user) => user.id === ROBOT_LEAD_ID) ||
    users.find((user) => user.email.toLowerCase() === email) ||
    users.find((user) => user.id === LEGACY_ROBOT_LEAD_ID);
  const ready =
    existing &&
    existing.id === ROBOT_LEAD_ID &&
    existing.name === 'Aakash' &&
    existing.status === 'ACTIVE' &&
    existing.account_status === 'ACTIVE' &&
    existing.email_verified !== false &&
    !existing.invitation_code_hash &&
    Boolean(existing.password_hash) &&
    existing.email.toLowerCase() === email &&
    (await verifyPassword(env.robotLeadPassword, existing.password_hash || ''));

  if (ready) {
    if (users.some((user) => user.id === LEGACY_ROBOT_LEAD_ID)) {
      store.saveUsers(users.filter((user) => user.id !== LEGACY_ROBOT_LEAD_ID));
    }
    return;
  }

  const now = new Date().toISOString();
  const seed = seedRobotLead();
  const next: User = {
    ...seed,
    ...existing,
    id: ROBOT_LEAD_ID,
    name: 'Aakash',
    email,
    role_id: existing?.role_id || seed.role_id,
    role_code: 'TEAM_LEAD',
    role_name: existing?.role_name || 'Team Lead',
    team_id: 't-robotics',
    team_name: 'Robotics & Automation Solution Team',
    reporting_manager_id: existing?.reporting_manager_id || seed.reporting_manager_id,
    status: 'ACTIVE',
    account_status: 'ACTIVE',
    email_verified: true,
    password_hash: existing?.password_hash && existing.email.toLowerCase() === email
      ? existing.password_hash
      : await hashPassword(env.robotLeadPassword),
    invitation_code_hash: undefined,
    invitation_created_at: undefined,
    invitation_expires_at: undefined,
    invitation_used_at: undefined,
    password_created_at: existing?.password_created_at || now,
    password_changed_at: now,
    updated_at: now,
  };

  const withoutLegacy = users.filter((user) => user.id !== LEGACY_ROBOT_LEAD_ID && user.id !== existing?.id);
  const replaced = users.some((user) => user.id === ROBOT_LEAD_ID);
  store.saveUsers(replaced
    ? users.filter((user) => user.id !== LEGACY_ROBOT_LEAD_ID).map((user) => (user.id === ROBOT_LEAD_ID ? next : user))
    : [...withoutLegacy, next]);
  console.info('[auth] Robot Lead direct-login account ready', { email, name: next.name });
}
