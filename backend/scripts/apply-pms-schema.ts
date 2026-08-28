import dns from 'node:dns';
import 'dotenv/config';
import { closePool, ensureSchema, pingDatabase } from '../src/store/postgres.js';
import { getPool } from '../src/store/postgres.js';

dns.setDefaultResultOrder('ipv4first');

async function main() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL is required');
  const parsed = new URL(raw);
  const dbName = decodeURIComponent(parsed.pathname.replace(/^\//, '') || 'PMS');
  console.log(`Applying PMS schema to ${parsed.hostname}:${parsed.port}/${dbName} as ${parsed.username}`);

  await pingDatabase();
  await ensureSchema();

  const result = await getPool().query<{ table_schema: string; table_name: string; table_type: string }>(`
    SELECT table_schema, table_name, table_type
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `);
  console.log('public schema objects:');
  for (const row of result.rows) {
    console.log(`  ${row.table_schema}.${row.table_name} (${row.table_type})`);
  }
  const tables = result.rows.filter((row) => row.table_type === 'BASE TABLE').map((row) => row.table_name);
  const missing = ['store_collections', 'users', 'roles', 'teams', 'leads'].filter((name) => !tables.includes(name));
  if (missing.length) {
    throw new Error(`Required tables missing after schema apply: ${missing.join(', ')}`);
  }
  const owner = await getPool().query<{ schema_owner: string }>(`
    SELECT pg_catalog.pg_get_userbyid(n.nspowner) AS schema_owner
    FROM pg_catalog.pg_namespace n
    WHERE n.nspname = 'public'
  `);
  const counts = await getPool().query<{
    users: string;
    collections: string;
  }>(`
    SELECT
      (SELECT COUNT(*)::text FROM users) AS users,
      (SELECT COUNT(*)::text FROM store_collections) AS collections
  `);
  const names = await getPool().query<{ name: string }>(
    `SELECT name FROM store_collections ORDER BY name`
  );
  console.log(`public schema owner: ${owner.rows[0]?.schema_owner}`);
  console.log(`row counts: users=${counts.rows[0]?.users}, store_collections=${counts.rows[0]?.collections}`);
  console.log(`collections: ${names.rows.map((row) => row.name).join(', ')}`);
  console.log(`Schema apply complete. In pgAdmin: ${dbName} → Schemas → public → Tables → Refresh.`);
  await closePool();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await closePool();
  } catch {
    // ignore
  }
  process.exit(1);
});
