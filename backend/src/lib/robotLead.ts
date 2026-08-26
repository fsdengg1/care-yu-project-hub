import { env } from '../config/env.js';
import { INITIAL_USERS } from '../data/seed.js';
import { store } from '../store/db.js';
import { User } from '../types.js';
import { hashPassword, verifyPassword } from './password.js';

export const ROBOT_LEAD_ID = 'u-robotlead1';

export function robotLeadEmail() {
  return (env.robotLeadEmail || 'robotlead1@careyu.ai').trim().toLowerCase();
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
    employee_id: 'CYA-012A',
    name: 'Robotics Lead',
    email: robotLeadEmail(),
    phone: '',
    role_id: 'r-tl',
    role_code: 'TEAM_LEAD',
    role_name: 'Team Lead',
    team_id: 't-robotics',
    team_name: 'Robotics & Solutions Team',
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
    users.find((user) => user.email.toLowerCase() === email) ||
    users.find((user) => user.id === ROBOT_LEAD_ID);
  const ready =
    existing &&
    existing.status === 'ACTIVE' &&
    existing.account_status === 'ACTIVE' &&
    existing.email_verified !== false &&
    !existing.invitation_code_hash &&
    Boolean(existing.password_hash) &&
    (await verifyPassword(env.robotLeadPassword, existing.password_hash || ''));

  if (ready && existing?.email.toLowerCase() === email) return;

  const now = new Date().toISOString();
  const seed = seedRobotLead();
  const next: User = {
    ...seed,
    ...existing,
    id: existing?.id || ROBOT_LEAD_ID,
    email,
    role_id: existing?.role_id || seed.role_id,
    role_code: 'TEAM_LEAD',
    role_name: existing?.role_name || 'Team Lead',
    team_id: existing?.team_id || seed.team_id,
    team_name: existing?.team_name || seed.team_name,
    reporting_manager_id: existing?.reporting_manager_id || seed.reporting_manager_id,
    status: 'ACTIVE',
    account_status: 'ACTIVE',
    email_verified: true,
    password_hash: await hashPassword(env.robotLeadPassword),
    invitation_code_hash: undefined,
    invitation_created_at: undefined,
    invitation_expires_at: undefined,
    invitation_used_at: undefined,
    password_created_at: existing?.password_created_at || now,
    password_changed_at: now,
    updated_at: now,
  };

  if (existing) {
    store.saveUsers(users.map((user) => (user.id === existing.id ? next : user)));
  } else {
    store.saveUsers([...users, next]);
  }
  console.info('[auth] Robot Lead direct-login account ready', { email });
}
