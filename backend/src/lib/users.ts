import { store } from '../store/db.js';
import { Team, User } from '../types.js';
import { isAllowedWorkEmail } from './authUser.js';
import { inferReportingManager } from './directoryRoles.js';
import { newId } from './leadWorkflow.js';

const PROTECTED_DELETE_ROLES = new Set(['CEO']);

export type UserInput = {
  name?: string;
  email?: string;
  phone?: string;
  employee_id?: string;
  role_id?: string;
  team_id?: string | null;
  reporting_manager_id?: string | null;
  status?: User['status'];
};

function nextEmployeeId(users: User[]) {
  const numbers = users
    .map((user) => Number(String(user.employee_id || '').replace(/\D/g, '')))
    .filter((value) => Number.isFinite(value));
  const next = (numbers.length ? Math.max(...numbers) : 100) + 1;
  return `CYA-${String(next).padStart(3, '0')}`;
}

function hydrateFromOrg(partial: Partial<User>, team?: Team): Partial<User> {
  const lead = team?.team_lead_id ? store.findUserById(team.team_lead_id) : undefined;
  return {
    ...partial,
    team_id: team?.id,
    team_name: team?.name,
    team_lead_id: lead?.id || team?.team_lead_id,
    team_lead_name: lead?.name || team?.team_lead_name,
  };
}

function applyOrgReporting(user: User): User {
  if (user.role_code === 'CEO') {
    const next = { ...user };
    delete next.reporting_manager_id;
    delete next.reporting_manager_name;
    return next;
  }
  const peers = store.getUsers().filter((item) => item.id !== user.id);
  const boss = inferReportingManager(user.role_code, peers, Boolean(user.team_id));
  if (!boss || boss.id === user.id) return user;
  return { ...user, reporting_manager_id: boss.id, reporting_manager_name: boss.name };
}

function syncTeamLead(user: User) {
  if (!user.team_id || user.role_code !== 'TEAM_LEAD') return;
  const teams = store.getTeams();
  const index = teams.findIndex((team) => team.id === user.team_id);
  if (index === -1) return;
  teams[index] = { ...teams[index], team_lead_id: user.id, team_lead_name: user.name };
  store.saveTeams(teams);
}

function clearTeamLeadIfNeeded(user: User) {
  const teams = store.getTeams().map((team) =>
    team.team_lead_id === user.id ? { ...team, team_lead_id: undefined, team_lead_name: 'Not Assigned' } : team
  );
  store.saveTeams(teams);
}

export function createUser(actor: User, body: UserInput) {
  const name = body.name?.trim();
  const email = body.email?.trim().toLowerCase();
  if (!name) return { error: 'Full name is required.' } as const;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'A valid work email is required.' } as const;

  const users = store.getUsers();
  if (users.some((user) => user.email.toLowerCase() === email)) {
    return { error: 'A user with this email already exists.' } as const;
  }

  const roles = store.getRoles();
  const role = roles.find((item) => item.id === body.role_id);
  if (!role) return { error: 'Assigned role is required.' } as const;

  const team = body.team_id ? store.getTeams().find((item) => item.id === body.team_id) : undefined;
  const now = new Date().toISOString();
  const user: User = applyOrgReporting({
    id: newId('u'),
    employee_id: body.employee_id?.trim() || nextEmployeeId(users),
    name,
    email,
    phone: body.phone?.trim() || '',
    role_id: role.id,
    role_code: role.code,
    role_name: role.name,
    reporting_manager_id: body.reporting_manager_id || actor.id,
    reporting_manager_name: store.findUserById(body.reporting_manager_id || actor.id)?.name,
    status: body.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
    account_status: body.status === 'INACTIVE' ? 'DISABLED' : 'ACTIVE',
    email_verified: true,
    created_at: now,
    updated_at: now,
    ...hydrateFromOrg({}, team),
  });

  users.unshift(user);
  store.saveUsers(users);
  syncTeamLead(user);
  store.appendAudit({
    user_id: actor.id,
    user_name: actor.name,
    user_role: actor.role_name,
    entity_type: 'USER',
    entity_id: user.id,
    entity_name: user.name,
    action: 'USER_CREATED',
    description: `${actor.name} provisioned ${user.name} as ${user.role_name}${user.team_name ? ` in ${user.team_name}` : ''}.`,
  });
  return { user };
}

export function updateUser(actor: User, userId: string, body: UserInput) {
  const users = store.getUsers();
  const index = users.findIndex((item) => item.id === userId);
  if (index === -1) return { error: 'not_found' } as const;
  const current = users[index];

  if (body.email) {
    const email = body.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'A valid work email is required.' } as const;
    if (users.some((user) => user.id !== userId && user.email.toLowerCase() === email)) {
      return { error: 'A user with this email already exists.' } as const;
    }
  }

  const roles = store.getRoles();
  const role = body.role_id ? roles.find((item) => item.id === body.role_id) : undefined;
  const teamId = body.team_id === null ? undefined : body.team_id !== undefined ? body.team_id : current.team_id;
  const team = teamId ? store.getTeams().find((item) => item.id === teamId) : undefined;
  const previousTeamId = current.team_id;

  let next: User = {
    ...current,
    name: body.name?.trim() || current.name,
    email: body.email?.trim().toLowerCase() || current.email,
    phone: body.phone !== undefined ? body.phone.trim() : current.phone,
    employee_id: body.employee_id?.trim() || current.employee_id,
    role_id: role?.id || current.role_id,
    role_code: role?.code || current.role_code,
    role_name: role?.name || current.role_name,
    reporting_manager_id:
      body.reporting_manager_id === null ? undefined : body.reporting_manager_id ?? current.reporting_manager_id,
    status: body.status || current.status,
    updated_at: new Date().toISOString(),
  };
  if (body.status === 'INACTIVE') {
    next.account_status = 'DISABLED';
  } else if (body.status === 'ACTIVE' && current.account_status === 'DISABLED') {
    next.account_status = current.password_hash || !current.invitation_code_hash ? 'ACTIVE' : 'INVITED';
  }
  next = { ...next, ...hydrateFromOrg(next, team) } as User;
  if (!team) {
    next = { ...next, team_id: undefined, team_name: undefined, team_lead_id: undefined, team_lead_name: undefined };
  }
  next = applyOrgReporting(next);

  users[index] = next;

  if (next.name !== current.name) {
    for (let i = 0; i < users.length; i += 1) {
      if (users[i].id === next.id) continue;
      if (users[i].reporting_manager_id === next.id) {
        users[i] = { ...users[i], reporting_manager_name: next.name };
      }
      if (users[i].team_lead_id === next.id) {
        users[i] = { ...users[i], team_lead_name: next.name };
      }
    }
  }

  store.saveUsers(users);

  if (previousTeamId && previousTeamId !== next.team_id && current.role_code === 'TEAM_LEAD') {
    clearTeamLeadIfNeeded(current);
  }
  syncTeamLead(next);

  store.appendAudit({
    user_id: actor.id,
    user_name: actor.name,
    user_role: actor.role_name,
    entity_type: 'USER',
    entity_id: next.id,
    entity_name: next.name,
    action: 'USER_UPDATED',
    description: `${actor.name} updated ${next.name} (${next.role_name}).`,
  });
  return { user: next };
}

export function updateOwnProfile(actor: User, body: Pick<UserInput, 'name' | 'phone' | 'email'>) {
  const name = body.name?.trim();
  if (!name || name.length < 2) return { error: 'Please enter your full name.' } as const;

  const input: UserInput = { name };
  if (body.phone !== undefined) input.phone = body.phone;
  if (body.email !== undefined) {
    const email = body.email.trim().toLowerCase();
    if (!isAllowedWorkEmail(email)) {
      return { error: 'Please use your CareYu work email address.' } as const;
    }
    input.email = email;
  }

  return updateUser(actor, actor.id, input);
}

export function deleteUser(actor: User, userId: string) {
  const users = store.getUsers();
  const index = users.findIndex((item) => item.id === userId);
  if (index === -1) return { error: 'not_found' } as const;
  const target = users[index];
  if (target.id === actor.id) return { error: 'You cannot delete your own account.' } as const;
  if (PROTECTED_DELETE_ROLES.has(target.role_code)) return { error: 'The CEO account cannot be deleted.' } as const;

  users.splice(index, 1);
  store.saveUsers(users);
  clearTeamLeadIfNeeded(target);
  store.appendAudit({
    user_id: actor.id,
    user_name: actor.name,
    user_role: actor.role_name,
    entity_type: 'USER',
    entity_id: target.id,
    entity_name: target.name,
    action: 'USER_DELETED',
    description: `${actor.name} deleted user ${target.name} (${target.employee_id}).`,
  });
  return { user: target };
}
