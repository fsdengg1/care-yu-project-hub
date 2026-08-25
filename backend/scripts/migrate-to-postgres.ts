import 'dotenv/config';
import { initStore, shutdownStore } from '../src/store/db.js';

async function main() {
  const force = process.argv.includes('--force-local');
  console.log(`Migrating store to Postgres${force ? ' (force import from local db.json)' : ''}...`);
  const result = await initStore({ forceImportLocal: force });
  console.log(`Source used: ${result.source}`);
  console.log('Record counts:');
  for (const [name, count] of Object.entries(result.counts)) {
    console.log(`  ${name}: ${count}`);
  }
  await shutdownStore();
  console.log('Migration complete. All collections are stored in Postgres (JSONB).');
}

main().catch(async (error) => {
  console.error('Migration failed:', error);
  try {
    await shutdownStore();
  } catch {
    // ignore shutdown errors after failure
  }
  process.exit(1);
});
