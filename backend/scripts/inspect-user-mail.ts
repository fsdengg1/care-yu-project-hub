import { initStore, shutdownStore, store } from '../src/store/db.js';

async function main() {
  await initStore();
  const email = 'fsdengg1@careyu.ai';
  const user = store.findUserByEmail(email);
  console.log(
    user
      ? {
          id: user.id,
          name: user.name,
          email: user.email,
          verified: user.email_verified,
          hasHash: Boolean(user.password_hash),
        }
      : 'USER_NOT_FOUND'
  );

  const mails = store
    .getOutboundEmails()
    .filter((item) => item.to_email.toLowerCase() === email)
    .slice(0, 8);
  console.log('outbound_count', mails.length);
  for (const mail of mails) {
    const link = (mail.body || '').match(/https?:\/\/\S+/);
    console.log({
      subject: mail.subject,
      status: mail.status,
      created_at: mail.created_at,
      link: link?.[0] || null,
    });
  }
  await shutdownStore();
}

main().catch(async (error) => {
  console.error(error);
  await shutdownStore().catch(() => undefined);
  process.exit(1);
});
