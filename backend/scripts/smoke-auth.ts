import { initStore, shutdownStore, store } from '../src/store/db.js';
import {
  authenticateLogin,
  createAccountPassword,
  invitationLogin,
  lookupLoginMode,
  requestPasswordReset,
  signupUser,
} from '../src/lib/authService.js';
import { generateInvitationCode, hashInvitationCode } from '../src/lib/tokens.js';

async function main() {
  await initStore();
  const email = `auth.test.${Date.now()}@careyu.ai`;

  const signup = await signupUser({
    name: 'Auth Tester',
    email,
  });
  console.log('signup', signup);
  if (!signup.ok) throw new Error('Signup failed');
  if ('invitationCode' in signup && signup.invitationCode) {
    throw new Error('Signup must not return the invitation code to the client');
  }

  if (store.findUserByEmail(email)) {
    throw new Error('Pending signup must not be stored as a user');
  }

  const firstPending = store.findPendingSignupByEmail(email);
  if (!firstPending) throw new Error('Pending signup was not stored');

  const again = await signupUser({ name: 'Auth Tester', email });
  console.log('signup_again', again);
  if (!again.ok) throw new Error('Re-signup of a pending email should succeed');

  const pending = store.findPendingSignupByEmail(email);
  if (!pending) throw new Error('Pending signup was not stored after re-signup');
  const knownCode = generateInvitationCode();
  store.savePendingSignup({
    ...pending,
    invitation_code_hash: hashInvitationCode(knownCode),
    invitation_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });

  const blocked = await authenticateLogin({ email, password: 'Careyu@1234' });
  console.log('password_login_before_invite', blocked.ok === false ? blocked.message : 'unexpected');

  const mode = lookupLoginMode(email);
  console.log('login_mode', mode);

  const invalid = await invitationLogin({ email, invitationCode: 'CY-FAKE-CODE' });
  console.log('invalid_invitation', invalid.ok === false ? invalid.code : 'unexpected');

  const invited = await invitationLogin({ email, invitationCode: knownCode });
  console.log('invitation_login', { ok: invited.ok });
  if (!invited.ok) throw new Error('Invitation login failed');

  const created = await createAccountPassword({
    user: invited.user,
    newPassword: 'Careyu@1234',
    confirmPassword: 'Careyu@1234',
  });
  console.log('create_password', { ok: created.ok });
  if (!created.ok) throw new Error('Create password failed');
  if (store.findPendingSignupByEmail(email)) {
    throw new Error('Pending signup should be removed after password is created');
  }

  const usedAgain = await invitationLogin({ email, invitationCode: knownCode });
  console.log('invitation_after_password', usedAgain.ok === false ? usedAgain.code : 'unexpected');

  const login = await authenticateLogin({ email, password: 'Careyu@1234' });
  console.log('password_login_after_setup', { ok: login.ok, role: login.ok ? login.user.role_code : undefined });
  if (!login.ok) throw new Error('Password login failed');

  const reset = await requestPasswordReset(email);
  console.log('forgot', reset);

  const badDomain = await signupUser({
    name: 'External User',
    email: 'x@gmail.com',
  });
  console.log('bad_domain', badDomain);

  const duplicate = await signupUser({ name: 'Auth Tester', email });
  console.log('duplicate', duplicate);

  const createdUser = store.findUserByEmail(email);
  console.log('stored_hashes', {
    hasPassword: Boolean(createdUser?.password_hash),
    invitationCleared: !createdUser?.invitation_code_hash,
    usedAt: Boolean(createdUser?.invitation_used_at),
    accountStatus: createdUser?.account_status,
  });

  store.saveUsers(store.getUsers().filter((user) => user.email.toLowerCase() !== email));
  store.deletePendingSignup(createdUser?.id || '');

  try {
    await shutdownStore();
  } catch (error) {
    console.warn('shutdown', error instanceof Error ? error.message : error);
  }
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
