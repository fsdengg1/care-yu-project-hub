import { initStore, shutdownStore, store } from '../src/store/db.js';
import { isSmokeTestAccount } from '../src/lib/smokeTestAccounts.js';

async function main() {
  await initStore();

  const users = store.getUsers();
  const pending = store.getPendingSignups();
  const removedUsers = users.filter((user) => isSmokeTestAccount(user));
  const removedPending = pending.filter((item) => isSmokeTestAccount(item));

  if (removedUsers.length) {
    store.saveUsers(users.filter((user) => !isSmokeTestAccount(user)));
  }
  for (const item of removedPending) {
    store.deletePendingSignup(item.id);
  }

  console.log(
    JSON.stringify(
      {
        removedUsers: removedUsers.map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          employee_id: user.employee_id,
        })),
        removedPending: removedPending.map((item) => ({
          id: item.id,
          name: item.name,
          email: item.email,
        })),
        usersRemaining: store.getUsers().length,
      },
      null,
      2
    )
  );

  await shutdownStore();
}

main().catch(async (error) => {
  console.error(error);
  await shutdownStore().catch(() => undefined);
  process.exit(1);
});
