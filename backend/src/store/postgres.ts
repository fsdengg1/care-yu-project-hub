import dns from 'node:dns';
import pg from 'pg';
import { env } from '../config/env.js';
import { User } from '../types.js';

// Render/Node 22 often tries IPv6 first; Aiven Postgres is IPv4-only and then times out.
dns.setDefaultResultOrder('ipv4first');

const { Pool } = pg;

export type CollectionName =
  | 'users'
  | 'roles'
  | 'teams'
  | 'leads'
  | 'projects'
  | 'escalations'
  | 'procurementRequests'
  | 'audits'
  | 'notifications'
  | 'tasks'
  | 'dailyUpdates'
  | 'leadDocuments'
  | 'leadComments'
  | 'leadActivities'
  | 'leadStatusHistory'
  | 'feasibilityTeamAssignments'
  | 'feasibilityEmployeeAllocations'
  | 'projectPhases'
  | 'conversations'
  | 'conversationParticipants'
  | 'chatMessages'
  | 'entityDocuments'
  | 'stageTransitions'
  | 'outboundEmails'
  | 'forumPosts'
  | 'forumComments'
  | 'forumReactions'
  | 'forumTags'
  | 'forumLiveMessages'
  | 'assignmentHistory'
  | 'notificationDeliveries'
  | 'pendingSignups'
  | 'systemMeta';

export const COLLECTION_NAMES: CollectionName[] = [
  'users',
  'roles',
  'teams',
  'leads',
  'projects',
  'escalations',
  'procurementRequests',
  'audits',
  'notifications',
  'tasks',
  'dailyUpdates',
  'leadDocuments',
  'leadComments',
  'leadActivities',
  'leadStatusHistory',
  'feasibilityTeamAssignments',
  'feasibilityEmployeeAllocations',
  'projectPhases',
  'conversations',
  'conversationParticipants',
  'chatMessages',
  'entityDocuments',
  'stageTransitions',
  'outboundEmails',
  'forumPosts',
  'forumComments',
  'forumReactions',
  'forumTags',
  'forumLiveMessages',
  'assignmentHistory',
  'notificationDeliveries',
  'pendingSignups',
  'systemMeta',
];

let pool: pg.Pool | null = null;

function connectionStringWithoutSslMode(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('sslmode');
    parsed.searchParams.delete('ssl');
    return parsed.toString();
  } catch {
    return url.replace(/([?&])sslmode=[^&]*/gi, '$1').replace(/[?&]$/, '');
  }
}

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: connectionStringWithoutSslMode(env.databaseUrl),
      // Managed Postgres (Aiven) uses a provider CA; for app use we accept TLS without pinning the CA file.
      ssl: env.databaseSsl ? { rejectUnauthorized: false } : false,
      max: 3,
      connectionTimeoutMillis: 60000,
      idleTimeoutMillis: 30000,
    });
  }
  return pool;
}

export async function ensureSchema(): Promise<void> {
  const { USERS_TABLE_DDL } = await import('./usersTable.js');
  const client = await getPool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS store_collections (
        name TEXT PRIMARY KEY,
        data JSONB NOT NULL DEFAULT '[]'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(USERS_TABLE_DDL);
  } finally {
    client.release();
  }
}

export async function loadAllCollections(): Promise<Record<CollectionName, unknown[]>> {
  const result = await getPool().query<{ name: string; data: unknown }>(
    `SELECT name, data FROM store_collections`
  );
  const out = {} as Record<CollectionName, unknown[]>;
  for (const name of COLLECTION_NAMES) {
    out[name] = [];
  }
  for (const row of result.rows) {
    if ((COLLECTION_NAMES as string[]).includes(row.name)) {
      out[row.name as CollectionName] = Array.isArray(row.data) ? row.data : [];
    }
  }
  const { loadUsersTable } = await import('./usersTable.js');
  const tableUsers = await loadUsersTable();
  if (tableUsers.length) {
    out.users = tableUsers;
  }
  return out;
}

export async function saveAllCollections(
  collections: Record<CollectionName, unknown[]>
): Promise<void> {
  const client = await getPool().connect();
  try {
    const { saveUsersTable } = await import('./usersTable.js');
    await saveUsersTable((collections.users as User[]) ?? []);
    await client.query('BEGIN');
    for (const name of COLLECTION_NAMES) {
      const payload = name === 'users' ? [] : (collections[name] ?? []);
      await client.query(
        `
          INSERT INTO store_collections (name, data, updated_at)
          VALUES ($1, $2::jsonb, NOW())
          ON CONFLICT (name)
          DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
        `,
        [name, JSON.stringify(payload)]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // No transaction was open if users-table save failed first.
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export async function pingDatabase(): Promise<void> {
  const timeoutMs = 30000;
  const attempts = 5;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await Promise.race([
        getPool().query('SELECT 1'),
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Database connection timed out after ${timeoutMs / 1000}s. Check DATABASE_URL, SSL, and network access.`));
          }, timeoutMs);
        }),
      ]);
      return;
    } catch (error) {
      lastError = error;
      console.error(
        `[store] Database ping failed (attempt ${attempt}/${attempts})`,
        error instanceof Error ? error.message : error
      );
      await closePool();
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Database connection failed.');
}
