import nodemailer from 'nodemailer';
import { createRequire } from 'node:module';
import { env } from '../config/env.js';
import { store } from '../store/db.js';
import { OutboundEmail, User } from '../types.js';
import { newId } from './leadWorkflow.js';

const require = createRequire(import.meta.url);

export type OutboundEmailInput = {
  toEmail: string;
  toName: string;
  toUserId?: string;
  subject: string;
  text: string;
  html: string;
};

export type EmailDeliveryResult = {
  status: 'SENT' | 'FAILED' | 'QUEUED';
  mode: 'console' | 'resend' | 'sendgrid' | 'brevo' | 'smtp' | 'elasticemail' | 'unknown';
  transactionId?: string;
};

function redactSecrets(value: string) {
  return value
    .replace(/CY-[A-Z0-9]{4}-[A-Z0-9]{4}/gi, '[REDACTED]')
    .replace(/([?&]token=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [REDACTED]');
}

function isValidRecipient(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim().toLowerCase());
}

let elasticApi: { ElasticEmail: any; emailsApi: any } | null = null;
function getElasticEmailApi() {
  if (elasticApi) return elasticApi;
  const ElasticEmail = require('@elasticemail/elasticemail-client');
  const client = ElasticEmail.ApiClient.instance;
  const apikey = client.authentications.apikey;
  apikey.apiKey = env.emailApiKey;
  const emailsApi = new ElasticEmail.EmailsApi();
  elasticApi = { ElasticEmail, emailsApi };
  return elasticApi;
}

async function deliverViaElasticEmail(input: OutboundEmailInput): Promise<EmailDeliveryResult> {
  if (!env.emailApiKey) {
    console.error('[email:elasticemail] Missing ELASTIC_EMAIL_API_KEY');
    return { status: 'FAILED', mode: 'elasticemail' };
  }

  try {
    const { ElasticEmail, emailsApi } = getElasticEmailApi();
    const from = `${env.emailFromName} <${env.emailFrom}>`;
    const email = ElasticEmail.EmailMessageData.constructFromObject({
      Recipients: [new ElasticEmail.EmailRecipient(input.toEmail)],
      Content: {
        Body: [
          ElasticEmail.BodyPart.constructFromObject({
            ContentType: 'HTML',
            Content: input.html,
          }),
          ElasticEmail.BodyPart.constructFromObject({
            ContentType: 'PlainText',
            Content: input.text,
          }),
        ],
        Subject: input.subject,
        From: from,
        ReplyTo: env.emailReplyTo || undefined,
      },
    });

    const data = await new Promise<Record<string, unknown>>((resolve, reject) => {
      emailsApi.emailsPost(email, (error: unknown, payload: unknown) => {
        if (error) reject(error);
        else resolve((payload || {}) as Record<string, unknown>);
      });
    });

    const transactionId = String(data.TransactionID || data.MessageID || data.transactionID || '').trim() || undefined;
    console.info('[email:elasticemail] sent', {
      to: input.toEmail,
      subject: input.subject,
      transactionId: transactionId || 'n/a',
    });
    return { status: 'SENT', mode: 'elasticemail', transactionId };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    console.error('[email:elasticemail] failed', { to: input.toEmail, subject: input.subject, message });
    return { status: 'FAILED', mode: 'elasticemail' };
  }
}

async function deliverViaSmtp(input: OutboundEmailInput): Promise<'SENT' | 'FAILED'> {
  if (!env.smtpHost || !env.smtpUser || !env.smtpPass) {
    console.error('[email:smtp] Missing SMTP_HOST / SMTP_USER / SMTP_PASS');
    return 'FAILED';
  }

  const transporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    auth: {
      user: env.smtpUser,
      pass: env.smtpPass,
    },
  });

  await transporter.sendMail({
    from: `"${env.emailFromName}" <${env.emailFrom}>`,
    to: `"${input.toName}" <${input.toEmail}>`,
    replyTo: env.emailReplyTo || undefined,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
  return 'SENT';
}

export async function deliverViaProvider(input: OutboundEmailInput): Promise<EmailDeliveryResult> {
  const provider = env.emailProvider;

  if (provider === 'console' || (provider !== 'smtp' && provider !== 'elasticemail' && !env.emailApiKey)) {
    if (provider === 'console' || (!env.emailApiKey && provider !== 'smtp' && provider !== 'elasticemail')) {
      console.log(`[email:console] to=${input.toEmail} subject=${input.subject}`);
      console.log('[email:console] Body omitted from logs. Set EMAIL_PROVIDER=elasticemail with ELASTIC_EMAIL_API_KEY to send mail.');
      return { status: 'SENT', mode: 'console' };
    }
  }

  try {
    if (provider === 'smtp') {
      const status = await deliverViaSmtp(input);
      return { status, mode: 'smtp' };
    }

    if (provider === 'elasticemail') {
      return deliverViaElasticEmail(input);
    }

    if (provider === 'resend') {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.emailApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${env.emailFromName} <${env.emailFrom}>`,
          to: [input.toEmail],
          subject: input.subject,
          html: input.html,
          text: input.text,
          ...(env.emailReplyTo ? { reply_to: env.emailReplyTo } : {}),
        }),
      });
      if (!response.ok) {
        const detail = await response.text();
        console.error('[email:resend] failed', response.status, detail);
        return { status: 'FAILED', mode: 'resend' };
      }
      return { status: 'SENT', mode: 'resend' };
    }

    if (provider === 'sendgrid') {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.emailApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: input.toEmail, name: input.toName }] }],
          from: { email: env.emailFrom, name: env.emailFromName },
          ...(env.emailReplyTo ? { reply_to: { email: env.emailReplyTo } } : {}),
          subject: input.subject,
          content: [
            { type: 'text/plain', value: input.text },
            { type: 'text/html', value: input.html },
          ],
        }),
      });
      if (!response.ok) {
        const detail = await response.text();
        console.error('[email:sendgrid] failed', response.status, detail);
        return { status: 'FAILED', mode: 'sendgrid' };
      }
      return { status: 'SENT', mode: 'sendgrid' };
    }

    if (provider === 'brevo') {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': env.emailApiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          sender: { email: env.emailFrom, name: env.emailFromName },
          to: [{ email: input.toEmail, name: input.toName }],
          ...(env.emailReplyTo ? { replyTo: { email: env.emailReplyTo } } : {}),
          subject: input.subject,
          htmlContent: input.html,
          textContent: input.text,
        }),
      });
      if (!response.ok) {
        const detail = await response.text();
        console.error('[email:brevo] failed', response.status, detail);
        return { status: 'FAILED', mode: 'brevo' };
      }
      return { status: 'SENT', mode: 'brevo' };
    }

    console.warn(`[email] Unknown EMAIL_PROVIDER "${provider}". Falling back to console.`);
    console.log(`[email:console] to=${input.toEmail} subject=${input.subject}`);
    return { status: 'SENT', mode: 'console' };
  } catch (error) {
    console.error('[email] delivery error', error);
    return { status: 'FAILED', mode: provider === 'smtp' ? 'smtp' : 'unknown' };
  }
}

export async function sendEmail(input: {
  toEmail: string;
  subject: string;
  htmlContent: string;
  toName?: string;
  text?: string;
  toUserId?: string;
}): Promise<EmailDeliveryResult> {
  const toEmail = input.toEmail.trim().toLowerCase();
  const subject = input.subject.trim();
  const htmlContent = input.htmlContent.trim();
  if (!isValidRecipient(toEmail)) {
    console.error('[email] Invalid recipient');
    return { status: 'FAILED', mode: env.emailProvider === 'elasticemail' ? 'elasticemail' : 'unknown' };
  }
  if (!subject) {
    console.error('[email] Missing subject');
    return { status: 'FAILED', mode: env.emailProvider === 'elasticemail' ? 'elasticemail' : 'unknown' };
  }
  if (!htmlContent) {
    console.error('[email] Missing HTML content');
    return { status: 'FAILED', mode: env.emailProvider === 'elasticemail' ? 'elasticemail' : 'unknown' };
  }

  const sent = await sendTransactionalEmail({
    toEmail,
    toName: input.toName || toEmail,
    toUserId: input.toUserId,
    subject,
    html: htmlContent,
    text: input.text || htmlContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
  });
  return {
    status: sent.status,
    mode: (sent.deliveryMode as EmailDeliveryResult['mode']) || 'unknown',
    transactionId: sent.transactionId,
  };
}

export async function sendTransactionalEmail(
  input: OutboundEmailInput
): Promise<OutboundEmail & { deliveryMode: string; transactionId?: string }> {
  const delivery = await deliverViaProvider(input);
  const email: OutboundEmail & { deliveryMode: string; transactionId?: string } = {
    id: newId('mail'),
    to_user_id: input.toUserId || 'unknown',
    to_email: input.toEmail,
    to_name: input.toName,
    subject: input.subject,
    body: redactSecrets(input.text),
    status: delivery.status,
    created_at: new Date().toISOString(),
    deliveryMode: delivery.mode,
    transactionId: delivery.transactionId,
  };
  const emails = store.getOutboundEmails();
  emails.unshift(email);
  store.saveOutboundEmails(emails);
  return email;
}

/** Legacy helper used by stage notifications — still works via transactional pipeline. */
export function queueUserEmail(input: {
  to: User;
  subject: string;
  body: string;
}): OutboundEmail {
  const email: OutboundEmail = {
    id: newId('mail'),
    to_user_id: input.to.id,
    to_email: input.to.email,
    to_name: input.to.name,
    subject: input.subject,
    body: input.body,
    status: 'QUEUED',
    created_at: new Date().toISOString(),
  };

  void sendTransactionalEmail({
    toEmail: input.to.email,
    toName: input.to.name,
    toUserId: input.to.id,
    subject: input.subject,
    text: input.body,
    html: `<pre style="font-family:inherit;white-space:pre-wrap;">${escapeHtml(input.body)}</pre>`,
  })
    .then((sent) => {
      email.status = sent.status;
    })
    .catch(() => {
      email.status = 'FAILED';
    });

  return email;
}

export function stageCompletedEmail(params: {
  to: User;
  projectName: string;
  stageName: string;
  completedBy: string;
  completedOn: string;
  nextStage?: string;
}) {
  const next = params.nextStage ? `\nNext stage:\n${params.nextStage}\n` : '';
  return queueUserEmail({
    to: params.to,
    subject: `Project Stage Completed – ${params.stageName}`,
    body: `Hi ${params.to.name},

The ${params.stageName} stage for the project
"${params.projectName}" has been completed by ${params.completedBy}.

Stage:
${params.stageName}

Completed By:
${params.completedBy}

Completed On:
${params.completedOn}
${next}
The project is now ready for the next stage.

Please review and proceed with the next action.

Regards,
Care Yu Automation
Project Tracker`,
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
