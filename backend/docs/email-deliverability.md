# CareYu email deliverability (Elastic Email)

Application code cannot guarantee Inbox placement. Configure the CareYu sending domain in Elastic Email and DNS.

## Application

Set these backend environment variables (never commit real secrets):

- `EMAIL_PROVIDER=elasticemail`
- `ELASTIC_EMAIL_API_KEY`
- `ELASTIC_EMAIL_FROM_EMAIL` or `ELASTIC_EMAIL_SENDER_EMAIL` — verified sender, for example `aicareyuautomation@gmail.com`
- `ELASTIC_EMAIL_FROM_NAME` or `ELASTIC_EMAIL_SENDER_NAME=CareYu Automation`
- `EMAIL_DEBUG=true` — verbose `[EMAIL]` logs without API keys or tokens
- `FRONTEND_URL` — production site URL, not localhost
- `DEFAULT_REPORTING_MANAGER_EMAIL` — org reporting manager (must be an existing user)
- `INVITATION_NOTIFY_EMAILS` — extra inboxes that also receive the invitation code, for example `fsdengg1@careyu.ai`

The backend sends through Elastic Email API v4:

`POST https://api.elasticemail.com/v4/emails`  
Header: `X-ElasticEmail-ApiKey`

Do not send from an unverified or mismatched From address.

## DNS for the CareYu sending domain

In Elastic Email, verify the sending domain and publish the records Elastic Email provides:

1. **SPF** — authorize Elastic Email (`include:_spf.elasticemail.com`).
2. **DKIM** — add the Elastic Email DKIM CNAME/TXT records.
3. **DMARC** — publish a DMARC policy (start with `p=none` while monitoring, then tighten).

After DNS propagation, confirm domain authentication in the Elastic Email dashboard.

Startup logs report only `configured` / `missing` for the API key and sender. They never print secrets.

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

CEO, CTO, and System Admin can:

- Open **Settings → Email Service**
- Call `GET /api/email/status`
- Call `POST /api/email/test` with `{ "to": "name@careyu.ai" }`

The response includes a transaction ID and never returns the API key.

The older `POST /api/auth/email-test` invitation/password-reset tester remains available for System Admin.
