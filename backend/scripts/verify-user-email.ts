import { initStore, shutdownStore, store } from '../src/store/db.js';

async function main() {
  const email = (process.argv[2] || 'fsdengg1@careyu.ai').trim().toLowerCase();
  await initStore();
  const users = store.getUsers();
  const index = users.findIndex((user) => user.email.toLowerCase() === email);
  if (index === -1) {
    console.error('User not found:', email);
    await shutdownStore();
    process.exit(1);
  }

  users[index] = {
    ...users[index],
    email_verified: true,
    email_verification_token_hash: undefined,
    email_verification_expires_at: undefined,
    updated_at: new Date().toISOString(),
  };
  store.saveUsers(users);
  console.log(`Verified account: ${email}`);
  console.log('You can now sign in at /login');
  await shutdownStore();
}

main().catch(async (error) => {
  console.error(error);
  await shutdownStore().catch(() => undefined);
  process.exit(1);
});
