import { initStore, shutdownStore } from '../src/store/db.js';
import { isAllowedWorkEmail } from '../src/lib/authUser.js';
import { env } from '../src/config/env.js';
import { signupUser } from '../src/lib/authService.js';

async function main() {
  console.log('allowed domains:', env.allowedEmailDomains);
  console.log('careyu.ai', isAllowedWorkEmail('FSDENGG1@CareYu.AI'));
  console.log('careyu.com', isAllowedWorkEmail('user@careyu.com'));
  console.log('gmail', isAllowedWorkEmail('user@gmail.com'));

  await initStore();
  const email = `signup.ui.${Date.now()}@careyu.ai`;
  const result = await signupUser({
    name: 'Kabitha',
    email,
  });
  console.log('signup.ai', result);
  await shutdownStore();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await shutdownStore();
  } catch {
    // ignore
  }
  process.exit(1);
});
