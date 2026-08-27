import { initStore, shutdownStore, store } from '../src/store/db.js';
import { formatUserDirectory, loadUsersTable } from '../src/store/usersTable.js';

async function main() {
  await initStore();
  const remaining = store.getUsers();
  const table = await loadUsersTable();
  console.log(`users remaining: ${remaining.length}`);
  console.log(`users table rows: ${table.length}`);
  console.log(formatUserDirectory(remaining));
  await shutdownStore();
}

main().catch(async (error) => {
  console.error(error);
  await shutdownStore().catch(() => undefined);
  process.exit(1);
});
