# CareYu email deliverability (Elastic Email)

Application code cannot guarantee Inbox placement. Configure the CareYu sending domain in Elastic Email and DNS.

## Application

Set these backend environment variables (never commit real secrets):

- `EMAIL_PROVIDER=elasticemail`
- `ELASTIC_EMAIL_API_KEY`
- `ELASTIC_EMAIL_SENDER_EMAIL` — must be a verified CareYu sender, for example `fsdlead1@careyu.ai`
- `ELASTIC_EMAIL_SENDER_NAME=CareYu Automation`
- `FRONTEND_URL` — production site URL, not localhost

Do not send from an unverified or mismatched From address.

## DNS for the CareYu sending domain

In Elastic Email, verify the sending domain and publish the records Elastic Email provides:

1. **SPF** — authorize Elastic Email to send for the domain.
2. **DKIM** — add the Elastic Email DKIM CNAME/TXT records.
3. **DMARC** — publish a DMARC policy (start with `p=none` while monitoring, then tighten).

After DNS propagation, confirm domain authentication in the Elastic Email dashboard.

## Responsibility notifications

Lead/task assignment, forward, reminder, and escalation emails use the same Elastic Email client (`backend/src/lib/email.ts`). They are sent by the backend process, including a scheduler that does not require the website to be open.

Configure:

- `REMINDER_AFTER_HOURS` (default 24)
- `MAX_REMINDERS` (default 3)
- `ESCALATION_AFTER_REMINDERS` (default 3)
- `DAILY_DIGEST_ENABLED` (default true)
- `NOTIFICATION_SCHEDULER_ENABLED` (default true)

The application sends to the current responsible person's work email using the verified CareYu sender. Inbox placement still depends on SPF, DKIM, DMARC, and domain reputation.

## Testing

System Admin can call `POST /api/auth/email-test` with `{ "type": "invitation" }` or `{ "type": "password-reset" }`. The response includes a transaction ID and never returns the API key.
