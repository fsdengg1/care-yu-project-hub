import { initStore, shutdownStore, store } from '../src/store/db.js';

async function main() {
  await initStore();
  for (const user of store.getUsers()) {
    console.log(
      JSON.stringify({
        name: user.name,
        role: user.role_code,
        team: user.team_name || null,
      })
    );
  }
  await shutdownStore();
}

main().catch(async (error) => {
  console.error(error);
  await shutdownStore().catch(() => undefined);
  process.exit(1);
});
