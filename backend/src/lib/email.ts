import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { store } from '../store/db.js';
import { OutboundEmail, User } from '../types.js';
import { newId } from './leadWorkflow.js';
import { ELASTIC_API, emailDebugLog, emailErrorLog, maskEmail, redactEmailSecrets } from './emailDiagnostics.js';

export type OutboundEmailInput = {
  toEmail: string;
  toName: string;
  toUserId?: string;
  subject: string;
  text: string;
  html: string;
  emailChannel?: 'INTERNAL' | 'CLIENT';
  emailType?: string;
  notificationId?: string;
  /** Override default env sender for this message (must be verified in Elastic Email). */
  fromEmail?: string;
  fromName?: string;
  /** Additional To recipients (same message, not CC). */
  toEmails?: string[];
  ccEmails?: string[];
  bccEmails?: string[];
};

function parseAddressList(value?: string | string[]): string[] {
  const raw = Array.isArray(value) ? value.join(',') : value || '';
  return [
    ...new Set(
      raw
        .split(/[,;]+/)
        .map((part) => part.trim().toLowerCase())
        .filter((part) => isValidRecipient(part))
    ),
  ];
}

export type EmailDeliveryResult = {
  status: 'SENT' | 'FAILED' | 'QUEUED';
  mode: 'console' | 'resend' | 'sendgrid' | 'brevo' | 'smtp' | 'elasticemail' | 'unknown';
  transactionId?: string;
  httpStatus?: number;
  accepted?: boolean;
  reason?: string;
};

function isValidRecipient(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim().toLowerCase());
}

async function deliverViaElasticEmail(input: OutboundEmailInput): Promise<EmailDeliveryResult> {
  if (!env.emailApiKey) {
    emailErrorLog('ELASTIC_EMAIL_API_KEY: missing');
    return {
      status: 'FAILED',
      mode: 'elasticemail',
      accepted: false,
      reason: 'ELASTIC_EMAIL_API_KEY is missing',
    };
  }
  const senderEmail = (input.fromEmail || env.emailFrom || '').trim().toLowerCase();
  const senderName = (input.fromName || env.emailFromName || '').trim();
  if (!senderEmail) {
    emailErrorLog('ELASTIC_EMAIL_FROM_EMAIL: missing');
    return {
      status: 'FAILED',
      mode: 'elasticemail',
      accepted: false,
      reason: 'Sender email is missing',
    };
  }
  if (!isValidRecipient(input.toEmail)) {
    emailErrorLog('Recipient email is missing or invalid');
    return {
      status: 'FAILED',
      mode: 'elasticemail',
      accepted: false,
      reason: 'Recipient email is missing or invalid',
    };
  }

  const from = senderEmail;
  const recipient = input.toEmail.trim().toLowerCase();
  const extraTo = parseAddressList(input.toEmails).filter((email) => email !== recipient);
  const toEmails = [recipient, ...extraTo];
  const ccEmails = parseAddressList(input.ccEmails).filter((email) => !toEmails.includes(email));
  const bccEmails = parseAddressList(input.bccEmails).filter(
    (email) => !toEmails.includes(email) && !ccEmails.includes(email)
  );
  emailDebugLog('Triggered', {
    recipient,
    toCount: toEmails.length,
    subject: input.subject,
    sender: from,
    cc: ccEmails.length,
    bcc: bccEmails.length,
  });
  emailDebugLog('Calling Elastic Email');

  const recipients = [
    ...toEmails.map((email) => ({ Email: email })),
    ...ccEmails.map((email) => ({ Email: email })),
    ...bccEmails.map((email) => ({ Email: email })),
  ];
  const headers: Record<string, string> = {};
  if (toEmails.length > 1) headers.To = toEmails.join(', ');
  if (ccEmails.length) headers.Cc = ccEmails.join(', ');
  if (bccEmails.length) headers.Bcc = bccEmails.join(', ');

  const payload = {
    Recipients: recipients,
    Content: {
      Body: [
        { ContentType: 'HTML', Charset: 'utf-8', Content: input.html },
        { ContentType: 'PlainText', Charset: 'utf-8', Content: input.text },
      ],
      From: from,
      FromName: senderName || undefined,
      ReplyTo: env.emailReplyTo || undefined,
      Subject: input.subject,
      ...(Object.keys(headers).length ? { Headers: headers } : {}),
    },
  };

  try {
    const response = await fetch(`${ELASTIC_API}/emails`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-ElasticEmail-ApiKey': env.emailApiKey,
      },
      body: JSON.stringify(payload),
    });
    const raw = await response.text();
    let data: Record<string, unknown> = {};
    try {
      data = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      data = {};
    }
    const transactionId =
      String(data.TransactionID || data.transactionID || data.MessageID || '').trim() || undefined;
    const providerMessage = redactEmailSecrets(
      String(data.Error || data.message || data.ErrorMessage || raw || '')
    ).slice(0, 400);

    console.info('[EMAIL] Elastic Email Status:', response.status, {
      recipient: maskEmail(recipient),
      transactionId: transactionId || 'n/a',
      accepted: response.ok,
    });

    if (!response.ok) {
      const reason = providerMessage || `Elastic Email HTTP ${response.status}`;
      emailErrorLog('Delivery status: Failed', { httpStatus: response.status, reason });
      return {
        status: 'FAILED',
        mode: 'elasticemail',
        httpStatus: response.status,
        accepted: false,
        reason,
        transactionId,
      };
    }

    emailDebugLog('Delivery status: Accepted', { transactionId: transactionId || 'n/a' });
    return {
      status: 'SENT',
      mode: 'elasticemail',
      httpStatus: response.status,
      accepted: true,
      transactionId,
    };
  } catch (error) {
    const reason = redactEmailSecrets(error instanceof Error ? error.message : 'unknown error');
    emailErrorLog('Delivery status: Failed', { reason });
    return { status: 'FAILED', mode: 'elasticemail', accepted: false, reason };
  }
}

async function deliverViaSmtp(input: OutboundEmailInput): Promise<'SENT' | 'FAILED'> {
  if (!env.smtpHost || !env.smtpUser || !env.smtpPass) {
    emailErrorLog('SMTP is selected but SMTP_HOST / SMTP_USER / SMTP_PASS is missing');
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
    from: `"${input.fromName || env.emailFromName}" <${input.fromEmail || env.emailFrom}>`,
    to: `"${input.toName}" <${input.toEmail}>`,
    cc: parseAddressList(input.ccEmails).join(', ') || undefined,
    bcc: parseAddressList(input.bccEmails).join(', ') || undefined,
    replyTo: env.emailReplyTo || undefined,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
  return 'SENT';
}

export async function deliverViaProvider(input: OutboundEmailInput): Promise<EmailDeliveryResult> {
  const provider = env.emailProvider;

  if (provider === 'elasticemail') {
    return deliverViaElasticEmail(input);
  }

  if (provider === 'smtp') {
    const status = await deliverViaSmtp(input);
    return { status, mode: 'smtp', accepted: status === 'SENT' };
  }

  if (provider === 'console') {
    emailDebugLog('Console provider — not calling Elastic Email', {
      recipient: input.toEmail,
      subject: input.subject,
    });
    console.warn('[EMAIL] EMAIL_PROVIDER=console. Inbox delivery is skipped.');
    return { status: 'QUEUED', mode: 'console', accepted: false, reason: 'EMAIL_PROVIDER=console' };
  }

  try {
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
        const detail = redactEmailSecrets(await response.text());
        emailErrorLog('resend failed', { httpStatus: response.status, reason: detail.slice(0, 400) });
        return { status: 'FAILED', mode: 'resend', httpStatus: response.status, accepted: false };
      }
      return { status: 'SENT', mode: 'resend', accepted: true, httpStatus: response.status };
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
        const detail = redactEmailSecrets(await response.text());
        emailErrorLog('sendgrid failed', { httpStatus: response.status, reason: detail.slice(0, 400) });
        return { status: 'FAILED', mode: 'sendgrid', httpStatus: response.status, accepted: false };
      }
      return { status: 'SENT', mode: 'sendgrid', accepted: true, httpStatus: response.status };
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
        const detail = redactEmailSecrets(await response.text());
        emailErrorLog('brevo failed', { httpStatus: response.status, reason: detail.slice(0, 400) });
        return { status: 'FAILED', mode: 'brevo', httpStatus: response.status, accepted: false };
      }
      return { status: 'SENT', mode: 'brevo', accepted: true, httpStatus: response.status };
    }

    emailErrorLog(`Unknown EMAIL_PROVIDER "${provider}". Elastic Email was not called.`);
    return { status: 'FAILED', mode: 'unknown', accepted: false, reason: `Unknown EMAIL_PROVIDER "${provider}"` };
  } catch (error) {
    const reason = redactEmailSecrets(error instanceof Error ? error.message : 'unknown error');
    emailErrorLog('delivery error', { reason });
    return { status: 'FAILED', mode: 'unknown', accepted: false, reason };
  }
}

export async function sendEmail(input: {
  toEmail: string;
  subject: string;
  htmlContent: string;
  toName?: string;
  text?: string;
  toUserId?: string;
  emailChannel?: 'INTERNAL' | 'CLIENT';
  emailType?: string;
  notificationId?: string;
  fromEmail?: string;
  fromName?: string;
  toEmails?: string[];
  ccEmails?: string[];
  bccEmails?: string[];
}): Promise<EmailDeliveryResult> {
  const toList = parseAddressList([input.toEmail, ...(input.toEmails || [])]);
  const toEmail = toList[0] || '';
  const extraTo = toList.slice(1);
  const subject = input.subject.trim();
  const htmlContent = input.htmlContent.trim();
  if (!isValidRecipient(toEmail)) {
    emailErrorLog('Invalid recipient');
    return { status: 'FAILED', mode: env.emailProvider === 'elasticemail' ? 'elasticemail' : 'unknown', reason: 'Recipient email is missing or invalid' };
  }
  if (!subject) {
    emailErrorLog('Missing subject');
    return { status: 'FAILED', mode: env.emailProvider === 'elasticemail' ? 'elasticemail' : 'unknown', reason: 'Subject is missing' };
  }
  if (!htmlContent) {
    emailErrorLog('Missing HTML content');
    return { status: 'FAILED', mode: env.emailProvider === 'elasticemail' ? 'elasticemail' : 'unknown', reason: 'HTML body is missing' };
  }

  const sent = await sendTransactionalEmail({
    toEmail,
    toName: input.toName || toEmail,
    toUserId: input.toUserId,
    subject,
    html: htmlContent,
    text: input.text || htmlContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    emailChannel: input.emailChannel,
    emailType: input.emailType,
    notificationId: input.notificationId,
    fromEmail: input.fromEmail,
    fromName: input.fromName,
    toEmails: extraTo,
    ccEmails: input.ccEmails,
    bccEmails: input.bccEmails,
  });
  return {
    status: sent.status,
    mode: (sent.deliveryMode as EmailDeliveryResult['mode']) || 'unknown',
    transactionId: sent.transactionId,
    reason: sent.failureReason,
  };
}

export async function sendTransactionalEmail(
  input: OutboundEmailInput
): Promise<OutboundEmail & { deliveryMode: string; transactionId?: string; failureReason?: string; httpStatus?: number }> {
  const delivery = await deliverViaProvider(input);
  const email: OutboundEmail & { deliveryMode: string; transactionId?: string; failureReason?: string; httpStatus?: number } = {
    id: newId('mail'),
    to_user_id: input.toUserId || 'unknown',
    to_email: input.toEmail,
    to_name: input.toName,
    subject: input.subject,
    body: redactEmailSecrets(input.text),
    status: delivery.status,
    created_at: new Date().toISOString(),
    email_channel: input.emailChannel,
    email_type: input.emailType,
    notification_id: input.notificationId,
    deliveryMode: delivery.mode,
    transactionId: delivery.transactionId,
    transaction_id: delivery.transactionId,
    failureReason: delivery.reason,
    httpStatus: delivery.httpStatus,
  };
  const emails = store.getOutboundEmails();
  emails.unshift(email);
  store.saveOutboundEmails(emails.slice(0, 500));
  return email;
}

export async function sendTestEmail(toEmail: string) {
  const recipient = toEmail.trim().toLowerCase();
  if (!isValidRecipient(recipient)) {
    return {
      ok: false as const,
      status: 'FAILED' as const,
      reason: 'Enter a valid recipient email address.',
      deliveryMode: env.emailProvider,
      transactionId: null,
    };
  }
  const html = `
    <p>Hello,</p>
    <p>This is a test email from CareYu Automation Project Hub.</p>
    <p>Regards,<br/>CareYu Automation</p>
  `;
  const result = await sendTransactionalEmail({
    toEmail: recipient,
    toName: recipient,
    subject: 'CareYu Invitation Email Test',
    html,
    text: 'This is a test email from CareYu Automation Project Hub.',
  });
  return {
    ok: result.status === 'SENT',
    status: result.status,
    transactionId: result.transactionId || null,
    deliveryMode: result.deliveryMode,
    reason: result.failureReason || null,
  };
}

/** Legacy helper used by stage notifications — still works via transactional pipeline. */
export function queueUserEmail(input: {
  to: User;
  subject: string;
  body: string;
}): OutboundEmail {
  if (!input.to?.email) {
    emailErrorLog('Stage email skipped: recipient email is missing');
    return {
      id: newId('mail'),
      to_user_id: input.to?.id || 'unknown',
      to_email: '',
      to_name: input.to?.name || '',
      subject: input.subject,
      body: input.body,
      status: 'FAILED',
      created_at: new Date().toISOString(),
    };
  }

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
      email.transaction_id = sent.transactionId;
    })
    .catch((error) => {
      email.status = 'FAILED';
      emailErrorLog('Stage email failed', {
        reason: redactEmailSecrets(error instanceof Error ? error.message : 'unknown error'),
      });
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
