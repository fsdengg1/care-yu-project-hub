import 'dotenv/config';
import { closePool, ensureSchema, loadAllCollections, pingDatabase } from '../src/store/postgres.js';

async function main() {
  await pingDatabase();
  await ensureSchema();
  const collections = await loadAllCollections();
  let total = 0;
  console.log('Postgres store_collections:');
  for (const [name, rows] of Object.entries(collections)) {
    const count = rows.length;
    total += count;
    console.log(`  ${name}: ${count}`);
  }
  console.log(`total records: ${total}`);
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
