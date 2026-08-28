import { env } from '../config/env.js';
import { store } from '../store/db.js';
import { User } from '../types.js';
import { hashPassword, verifyPassword } from './password.js';
import { projectManagerEmail } from './projectManagerAccount.js';
import { robotLeadEmail } from './robotLead.js';

export const ENGINEERING_DIRECTOR_EMAIL = 'sabarigiri@careyu.ai';

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

type DirectoryRole = {
  role_id: string;
  role_code: string;
  role_name: string;
};

const ROLE_BY_CODE: Record<string, { role_id: string; role_name: string }> = {
  CEO: { role_id: 'r-ceo', role_name: 'CEO' },
  BUSINESS_HEAD: { role_id: 'r-bh', role_name: 'Business Head' },
  ENG_DIRECTOR: { role_id: 'r-ed', role_name: 'Engineering Director' },
  PROJECT_MANAGER: { role_id: 'r-pm', role_name: 'Project Manager' },
  TEAM_LEAD: { role_id: 'r-tl', role_name: 'Team Lead' },
  EMPLOYEE: { role_id: 'r-emp', role_name: 'Team Member' },
};

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function nameHaystack(name: string) {
  return normalize(name).replace(/[^a-z]/g, '');
}

export function resolveDirectoryRole(emailRaw: string, nameRaw = ''): DirectoryRole | null {
  const email = normalize(emailRaw);
  const name = nameHaystack(nameRaw);
  const pmEmail = projectManagerEmail();
  const robotEmail = robotLeadEmail();

  if (email === 'ceo@careyu.ai' || name.includes('bernard')) {
    return { ...ROLE_BY_CODE.CEO, role_code: 'CEO' };
  }
  if (
    email === 'businesshead@careyu.ai' ||
    email.startsWith('businesshead@') ||
    name.includes('shradha') ||
    name.includes('sharadha')
  ) {
    return { ...ROLE_BY_CODE.BUSINESS_HEAD, role_code: 'BUSINESS_HEAD' };
  }
  if (
    email === ENGINEERING_DIRECTOR_EMAIL ||
    email.startsWith('sabarigiri@') ||
    email.startsWith('sabirigiri@') ||
    name.includes('sabarigiri') ||
    name.includes('sabirigiri') ||
    name.includes('sabagiri')
  ) {
    return { ...ROLE_BY_CODE.ENG_DIRECTOR, role_code: 'ENG_DIRECTOR' };
  }
  if (email === pmEmail || name === 'arivan') {
    return { ...ROLE_BY_CODE.PROJECT_MANAGER, role_code: 'PROJECT_MANAGER' };
  }
  if (email === robotEmail || name === 'aakash') {
    return { ...ROLE_BY_CODE.TEAM_LEAD, role_code: 'TEAM_LEAD' };
  }
  return null;
}

function withRole(user: User, role: DirectoryRole): User {
  const catalog = store.getRoles().find((item) => item.code === role.role_code);
  return {
    ...user,
    role_id: catalog?.id || role.role_id,
    role_code: role.role_code,
    role_name: catalog?.name || role.role_name,
  };
}

async function withWorkingPassword(user: User, password: string): Promise<User> {
  if (user.password_hash && (await verifyPassword(password, user.password_hash))) {
    return {
      ...user,
      account_status: 'ACTIVE',
      email_verified: true,
      status: 'ACTIVE',
    };
  }
  const now = new Date().toISOString();
  return {
    ...user,
    password_hash: await hashPassword(password),
    password_created_at: user.password_created_at || now,
    password_changed_at: now,
    account_status: 'ACTIVE',
    email_verified: true,
    status: 'ACTIVE',
    invitation_code_hash: undefined,
    invitation_expires_at: undefined,
    invitation_used_at: user.invitation_used_at || now,
    updated_at: now,
  };
}

function passwordForEmail(email: string): string {
  if (email === 'fsdengg1@careyu.ai' && env.fsdEngg1Password) return env.fsdEngg1Password;
  if (email === 'businesshead@careyu.ai' && env.businessHeadPassword) return env.businessHeadPassword;
  return env.demoPassword;
}

async function ensureEngineeringDirector(users: User[]): Promise<User[]> {
  const existing = users.find((user) => user.role_code === 'ENG_DIRECTOR' || normalize(user.email) === ENGINEERING_DIRECTOR_EMAIL);
  if (existing) {
    return users.map((user) =>
      user.id === existing.id ? withRole(user, { ...ROLE_BY_CODE.ENG_DIRECTOR, role_code: 'ENG_DIRECTOR' }) : user
    );
  }

  const ceo = users.find((user) => user.role_code === 'CEO');
  const now = new Date().toISOString();
  const created: User = await withWorkingPassword(
    withRole(
      {
        id: newId('u'),
        employee_id: `CYA-${String(users.length + 101).padStart(3, '0')}`,
        name: 'Sabarigiri',
        email: ENGINEERING_DIRECTOR_EMAIL,
        phone: '',
        role_id: 'r-ed',
        role_code: 'ENG_DIRECTOR',
        role_name: 'Engineering Director',
        reporting_manager_id: ceo?.id,
        reporting_manager_name: ceo?.name,
        status: 'ACTIVE',
        account_status: 'ACTIVE',
        email_verified: true,
        created_at: now,
        updated_at: now,
      },
      { ...ROLE_BY_CODE.ENG_DIRECTOR, role_code: 'ENG_DIRECTOR' }
    ),
    env.demoPassword
  );
  console.info('[auth] Engineering Director account ready', { email: created.email, name: created.name });
  return [...users, created];
}

export async function ensureLiveDirectory() {
  const original = store.getUsers();
  let users = original.map((user) => {
    const role = resolveDirectoryRole(user.email, user.name);
    return role ? withRole(user, role) : user;
  });

  users = await ensureEngineeringDirector(users);

  const repaired: User[] = [];
  for (const user of users) {
    const email = normalize(user.email);
    const needsLoginRepair =
      email === 'businesshead@careyu.ai' ||
      email === 'fsdengg1@careyu.ai' ||
      email === ENGINEERING_DIRECTOR_EMAIL ||
      user.role_code === 'ENG_DIRECTOR';
    repaired.push(needsLoginRepair ? await withWorkingPassword(user, passwordForEmail(email)) : user);
  }

  const changed =
    repaired.length !== original.length ||
    repaired.some((user, index) => {
      const prev = original.find((item) => item.id === user.id);
      return (
        !prev ||
        prev.role_code !== user.role_code ||
        prev.role_name !== user.role_name ||
        prev.password_hash !== user.password_hash ||
        prev.email !== user.email
      );
    });

  if (changed) {
    store.saveUsers(repaired);
    console.info('[auth] Live directory roles restored', {
      users: repaired.map((user) => ({ email: user.email, role: user.role_code })),
    });
  }
}
