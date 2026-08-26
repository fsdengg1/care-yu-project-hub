import { initStore, shutdownStore, store } from '../src/store/db.js';
import { authenticateLogin, lookupLoginMode, signupUser } from '../src/lib/authService.js';
import { env } from '../src/config/env.js';
import { robotLeadEmail } from '../src/lib/robotLead.js';

async function main() {
  await initStore();
  const email = robotLeadEmail();
  const user = store.findUserByEmail(email);
  const mode = lookupLoginMode(email);
  const login = await authenticateLogin({ email, password: env.robotLeadPassword });
  const signup = await signupUser({ name: 'Robot Lead Duplicate', email });
  const otherMode = lookupLoginMode('bernard.hamilton@careyu.com');

  console.log(
    JSON.stringify({
      email,
      found: Boolean(user),
      role: user?.role_code,
      status: user?.status,
      accountStatus: user?.account_status,
      verified: user?.email_verified,
      hasPassword: Boolean(user?.password_hash),
      loginMode: mode.loginMode,
      loginOk: login.ok,
      loginRole: login.ok ? login.user.role_code : undefined,
      signupBlocked: !signup.ok && signup.code === 'DUPLICATE_EMAIL',
      otherUsersStillPasswordMode: otherMode.loginMode === 'password',
    })
  );

  await shutdownStore();
}

main().catch(async (error) => {
  console.error(error);
  await shutdownStore().catch(() => undefined);
  process.exit(1);
});
