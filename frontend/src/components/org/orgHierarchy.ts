import { Team, User } from '@/lib/types';

export type OrgNodeKind = 'person' | 'team';

export interface OrgNode {
  id: string;
  kind: OrgNodeKind;
  title: string;
  subtitle: string;
  userId?: string;
  teamId?: string;
  roleCode?: string;
  reportingContextId?: string;
  children: OrgNode[];
}

export const ACCESS_SCOPES: Record<string, string> = {
  CEO: 'Overall organization and project visibility',
  CTO: 'Software team visibility',
  BUSINESS_HEAD: 'Project Manager and related teams',
  ENG_DIRECTOR: 'Project Manager and related teams',
  PROJECT_MANAGER: 'Software, Vision, Robotics, Procurement and Execution teams',
  TEAM_LEAD: 'Assigned team',
  EMPLOYEE: 'Own assigned work',
};

export const MANAGEMENT_ROLES = new Set([
  'CEO',
  'CTO',
  'BUSINESS_HEAD',
  'ENG_DIRECTOR',
  'PROJECT_MANAGER',
]);

export const ORG_ADMIN_ROLES = new Set([
  'CEO',
  'CTO',
  'PROJECT_MANAGER',
  'SYSTEM_ADMIN',
]);

const TEAM_ORDER = ['t-sw', 't-vision', 't-robotics', 't-procurement', 't-execution'];

export function getDepartment(user: User): string {
  switch (user.role_code) {
    case 'CEO':
      return 'Executive Leadership';
    case 'CTO':
      return 'Technology';
    case 'BUSINESS_HEAD':
      return 'Business Development';
    case 'ENG_DIRECTOR':
      return 'Engineering';
    case 'PROJECT_MANAGER':
      return 'Project Management';
    case 'SYSTEM_ADMIN':
      return 'Platform Administration';
    default:
      return user.team_name || 'Unassigned';
  }
}

export function getAccessScope(roleCode: string, teamName?: string): string {
  if (roleCode === 'TEAM_LEAD' && teamName) return `${teamName} — assigned team visibility`;
  if (roleCode === 'EMPLOYEE') return 'Own assigned work';
  return ACCESS_SCOPES[roleCode] || 'Role-based operational access';
}

function personNode(
  user: User,
  children: OrgNode[] = [],
  options?: { idSuffix?: string; reportingContextId?: string; subtitle?: string }
): OrgNode {
  return {
    id: `person-${user.id}${options?.idSuffix ? `-${options.idSuffix}` : ''}`,
    kind: 'person',
    title: user.name,
    subtitle: options?.subtitle || user.role_name,
    userId: user.id,
    roleCode: user.role_code,
    reportingContextId: options?.reportingContextId,
    children,
  };
}

function orderedTeams(teams: Team[]): Team[] {
  return [...teams].sort((a, b) => {
    const ai = TEAM_ORDER.indexOf(a.id);
    const bi = TEAM_ORDER.indexOf(b.id);
    if (ai === -1 && bi === -1) return a.name.localeCompare(b.name);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

function teamMembers(teamId: string, users: User[]): User[] {
  const members = users.filter((u) => u.team_id === teamId && u.role_code !== 'SYSTEM_ADMIN');
  return members.sort((a, b) => {
    if (a.role_code === 'TEAM_LEAD' && b.role_code !== 'TEAM_LEAD') return -1;
    if (b.role_code === 'TEAM_LEAD' && a.role_code !== 'TEAM_LEAD') return 1;
    return a.name.localeCompare(b.name);
  });
}

function teamBranch(team: Team, users: User[], suffix: string): OrgNode {
  const members = teamMembers(team.id, users);
  const lead = members.find((m) => m.id === team.team_lead_id) || members.find((m) => m.role_code === 'TEAM_LEAD');
  return {
    id: `team-${team.id}-${suffix}`,
    kind: 'team',
    title: team.name,
    subtitle: lead ? `Lead: ${lead.name}` : 'Lead not assigned',
    teamId: team.id,
    children: members.map((member) =>
      personNode(member, [], {
        idSuffix: suffix,
        reportingContextId: member.reporting_manager_id,
      })
    ),
  };
}

function softwareTeam(teams: Team[], users: User[], suffix: string): OrgNode | null {
  const team = teams.find((t) => t.id === 't-sw' || t.code === 'SOFTWARE');
  return team ? teamBranch(team, users, suffix) : null;
}

function operationalTeams(teams: Team[], users: User[], suffix: string): OrgNode[] {
  return orderedTeams(teams).map((team) => teamBranch(team, users, suffix));
}

export function buildOrganizationTree(users: User[], teams: Team[]): OrgNode[] {
  const directory = users.filter((u) => u.role_code !== 'SYSTEM_ADMIN');
  const ceo = directory.find((u) => u.role_code === 'CEO');
  const cto = directory.find((u) => u.role_code === 'CTO');
  const businessHead = directory.find((u) => u.role_code === 'BUSINESS_HEAD');
  const engineeringDirector = directory.find((u) => u.role_code === 'ENG_DIRECTOR');
  const projectManager = directory.find((u) => u.role_code === 'PROJECT_MANAGER');

  if (!ceo) return [];

  const ctoChildren: OrgNode[] = [];
  if (cto) {
    const sw = softwareTeam(teams, directory, 'cto');
    if (sw) ctoChildren.push(sw);
  }

  const pmUnderBusiness = projectManager
    ? personNode(projectManager, operationalTeams(teams, directory, 'pm-bh'), {
        idSuffix: 'bh',
        reportingContextId: businessHead?.id,
      })
    : null;

  const pmUnderEngineering = projectManager
    ? personNode(projectManager, operationalTeams(teams, directory, 'pm-ed'), {
        idSuffix: 'ed',
        reportingContextId: engineeringDirector?.id,
      })
    : null;

  const children: OrgNode[] = [];

  if (cto) {
    children.push(personNode(cto, ctoChildren, { reportingContextId: ceo.id }));
  }
  if (businessHead) {
    children.push(
      personNode(businessHead, pmUnderBusiness ? [pmUnderBusiness] : [], { reportingContextId: ceo.id })
    );
  }
  if (engineeringDirector) {
    children.push(
      personNode(engineeringDirector, pmUnderEngineering ? [pmUnderEngineering] : [], {
        reportingContextId: ceo.id,
      })
    );
  }

  return [personNode(ceo, children)];
}

export function filterOrganizationTree(
  nodes: OrgNode[],
  query: string,
  roleFilter: string,
  teamFilter: string,
  users: User[]
): OrgNode[] {
  const q = query.trim().toLowerCase();

  const selfMatches = (node: OrgNode): boolean => {
    const user = node.userId ? users.find((u) => u.id === node.userId) : undefined;
    const haystack = [
      node.title,
      node.subtitle,
      user?.email,
      user?.role_name,
      user?.role_code,
      user?.team_name,
      user?.employee_id,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    const queryOk = !q || haystack.includes(q);
    const roleOk = roleFilter === 'ALL' || node.roleCode === roleFilter;
    const teamOk =
      teamFilter === 'ALL' ||
      node.teamId === teamFilter ||
      user?.team_id === teamFilter;

    if (node.kind === 'team') {
      return queryOk && (teamFilter === 'ALL' || node.teamId === teamFilter) && roleFilter === 'ALL';
    }

    return queryOk && roleOk && teamOk;
  };

  const walk = (node: OrgNode): OrgNode | null => {
    const children = node.children.map(walk).filter((child): child is OrgNode => child !== null);
    if (selfMatches(node) || children.length > 0) {
      return { ...node, children };
    }
    return null;
  };

  return nodes.map(walk).filter((node): node is OrgNode => node !== null);
}

export function collectExpandableIds(nodes: OrgNode[]): Set<string> {
  const ids = new Set<string>();
  const walk = (node: OrgNode) => {
    if (node.children.length > 0) ids.add(node.id);
    node.children.forEach(walk);
  };
  nodes.forEach(walk);
  return ids;
}

export const ROLE_LABELS: Record<string, string> = {
  CEO: 'CEO',
  CTO: 'CTO',
  BUSINESS_HEAD: 'Business Head',
  ENG_DIRECTOR: 'Engineering Director',
  PROJECT_MANAGER: 'Project Manager',
  TEAM_LEAD: 'Team Lead',
  EMPLOYEE: 'Team Member',
};

export function defaultExpandedIds(nodes: OrgNode[]): Set<string> {
  const ids = new Set<string>();
  const walk = (node: OrgNode) => {
    if (node.kind === 'person' && node.children.length > 0) ids.add(node.id);
    node.children.forEach(walk);
  };
  nodes.forEach(walk);
  return ids;
}
