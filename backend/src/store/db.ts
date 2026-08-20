import fs from 'node:fs';
import path from 'node:path';
import { Role, Team, User } from '../types.js';
import { INITIAL_ROLES, INITIAL_TEAMS, INITIAL_USERS } from '../data/seed.js';

interface DbShape {
  users: User[];
  roles: Role[];
  teams: Team[];
}

const dataDir = path.join(process.cwd(), 'data');
const dbPath = path.join(dataDir, 'db.json');

function mergeById<T extends { id: string }>(stored: T[], seed: T[]): T[] {
  const known = new Set(stored.map((item) => item.id));
  return [...stored, ...seed.filter((item) => !known.has(item.id))];
}

function loadDb(): DbShape {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dbPath)) {
    const initial: DbShape = {
      users: INITIAL_USERS,
      roles: INITIAL_ROLES,
      teams: INITIAL_TEAMS,
    };
    fs.writeFileSync(dbPath, JSON.stringify(initial, null, 2));
    return initial;
  }
  const parsed = JSON.parse(fs.readFileSync(dbPath, 'utf8')) as DbShape;
  parsed.users = mergeById(parsed.users ?? [], INITIAL_USERS);
  parsed.roles = mergeById(parsed.roles ?? [], INITIAL_ROLES);
  parsed.teams = parsed.teams?.length ? parsed.teams : INITIAL_TEAMS;
  return parsed;
}

function saveDb(db: DbShape) {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

export const store = {
  getUsers(): User[] {
    return loadDb().users;
  },
  getRoles(): Role[] {
    return loadDb().roles;
  },
  getTeams(): Team[] {
    return loadDb().teams;
  },
  findUserByEmail(email: string): User | undefined {
    const normalized = email.trim().toLowerCase();
    return this.getUsers().find((user) => user.email.toLowerCase() === normalized);
  },
  findUserById(id: string): User | undefined {
    return this.getUsers().find((user) => user.id === id);
  },
  saveUsers(users: User[]) {
    const db = loadDb();
    db.users = users;
    saveDb(db);
  },
};
