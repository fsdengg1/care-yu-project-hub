import { env } from '../config/env.js';
import { sendTransactionalEmail } from './email.js';

function logoUrl() {
  return `${env.frontendUrl}/assets/branding/careyu-logo.png`;
}

export function brandedEmailLayout(params: {
  title: string;
  preheader: string;
  greeting: string;
  paragraphs: string[];
  ctaLabel: string;
  ctaUrl: string;
  footerNote: string;
}) {
  const paragraphsHtml = params.paragraphs.map((p) => `<p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6;">${p}</p>`).join('');
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${params.title}</title>
</head>
<body style="margin:0;padding:0;background:#F4F7FB;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${params.preheader}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F4F7FB;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="background:#0B1F3A;padding:24px 28px;">
              <img src="${logoUrl()}" alt="CareYu" height="36" style="display:block;height:36px;width:auto;" />
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <h1 style="margin:0 0 8px;color:#0B1F3A;font-size:22px;">${params.title}</h1>
              <p style="margin:0 0 20px;color:#0B1F3A;font-size:16px;font-weight:600;">${params.greeting}</p>
              ${paragraphsHtml}
              <p style="margin:28px 0;">
                <a href="${params.ctaUrl}" style="display:inline-block;background:#1D4ED8;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:10px;">${params.ctaLabel}</a>
              </p>
              <p style="margin:0 0 8px;color:#64748b;font-size:12px;line-height:1.5;">If the button does not work, copy and paste this link into your browser:</p>
              <p style="margin:0 0 20px;color:#1D4ED8;font-size:12px;word-break:break-all;">${params.ctaUrl}</p>
              <p style="margin:0;color:#64748b;font-size:13px;line-height:1.5;">${params.footerNote}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;background:#F8FAFC;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px;">
              Need help? Contact <a href="mailto:${env.supportEmail}" style="color:#1D4ED8;text-decoration:none;">${env.supportEmail}</a><br/>
              © ${new Date().getFullYear()} CareYu Automation. All rights reserved.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    params.title,
    '',
    params.greeting,
    ...params.paragraphs,
    '',
    `${params.ctaLabel}: ${params.ctaUrl}`,
    '',
    params.footerNote,
    '',
    `Need help? Contact ${env.supportEmail}`,
  ].join('\n');

  return { html, text };
}

export async function sendVerificationEmail(input: {
  toEmail: string;
  toName: string;
  toUserId: string;
  token: string;
  expiresInHours: number;
}) {
  const verifyUrl = `${env.frontendUrl}/verify-email?token=${encodeURIComponent(input.token)}`;
  const content = brandedEmailLayout({
    title: 'Verify Your CareYu Account',
    preheader: 'Confirm your work email to activate your CareYu account.',
    greeting: `Hello ${input.toName},`,
    paragraphs: [
      'Welcome to CareYu Automation Project Management Tool.',
      'Please verify your work email address to activate your account and start signing in.',
      `This verification link expires in ${input.expiresInHours} hour${input.expiresInHours === 1 ? '' : 's'}.`,
    ],
    ctaLabel: 'Verify Account',
    ctaUrl: verifyUrl,
    footerNote: 'If you did not create this account, you can safely ignore this email.',
  });

  return sendTransactionalEmail({
    toEmail: input.toEmail,
    toName: input.toName,
    toUserId: input.toUserId,
    subject: 'Verify Your CareYu Account',
    ...content,
  });
}

export async function sendPasswordResetEmail(input: {
  toEmail: string;
  toName: string;
  toUserId: string;
  token: string;
  expiresInMinutes: number;
}) {
  const resetUrl = `${env.frontendUrl}/reset-password?token=${encodeURIComponent(input.token)}`;
  const content = brandedEmailLayout({
    title: 'Reset Your CareYu Password',
    preheader: 'Use this secure link to reset your CareYu password.',
    greeting: `Hello ${input.toName},`,
    paragraphs: [
      'We received a request to reset your CareYu Automation account password.',
      `This link will expire in ${input.expiresInMinutes} minutes and can be used only once.`,
      'If you did not request this password reset, you can safely ignore this email.',
    ],
    ctaLabel: 'Reset Password',
    ctaUrl: resetUrl,
    footerNote: 'For your security, never share this link with anyone.',
  });

  return sendTransactionalEmail({
    toEmail: input.toEmail,
    toName: input.toName,
    toUserId: input.toUserId,
    subject: 'Reset Your CareYu Password',
    ...content,
  });
}

export async function sendPasswordChangedEmail(input: {
  toEmail: string;
  toName: string;
  toUserId: string;
}) {
  const content = brandedEmailLayout({
    title: 'Your CareYu Password Was Changed',
    preheader: 'A security notice about your CareYu account password.',
    greeting: `Hello ${input.toName},`,
    paragraphs: [
      'Your CareYu account password was recently changed.',
      'If you made this change, no further action is required.',
      'If you did not change your password, contact your administrator immediately.',
    ],
    ctaLabel: 'Go to Login',
    ctaUrl: `${env.frontendUrl}/login`,
    footerNote: 'This message does not include your password.',
  });

  return sendTransactionalEmail({
    toEmail: input.toEmail,
    toName: input.toName,
    toUserId: input.toUserId,
    subject: 'Your CareYu account password was recently changed',
    ...content,
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function sendInvitationToManager(input: {
  managerEmail: string;
  managerName: string;
  managerUserId: string;
  employeeName: string;
  employeeEmail: string;
  invitationCode: string;
  expiresInHours: number;
}) {
  const employeeName = escapeHtml(input.employeeName);
  const employeeEmail = escapeHtml(input.employeeEmail);
  const invitationCode = escapeHtml(input.invitationCode);
  const managerName = escapeHtml(input.managerName);
  const loginUrl = `${env.frontendUrl}/invitation-login`;
  const hours = Math.max(1, Math.round(input.expiresInHours));
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>New CareYu Account Invitation Request</title>
</head>
<body style="margin:0;padding:0;background:#F4F7FB;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">A new employee has requested CareYu access. Share the invitation code to complete first-time login.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F4F7FB;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="background:#0B1F3A;padding:24px 28px;">
              <img src="${logoUrl()}" alt="CareYu Automation" height="36" style="display:block;height:36px;width:auto;" />
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <h1 style="margin:0 0 8px;color:#0B1F3A;font-size:22px;">New CareYu Account Invitation Request</h1>
              <p style="margin:0 0 20px;color:#0B1F3A;font-size:16px;font-weight:600;">Hello ${managerName},</p>
              <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6;">A new employee has requested access to the CareYu Automation Project Management Tool.</p>
              <table role="presentation" width="100%" style="margin:0 0 20px;background:#F8FAFC;border:1px solid #e2e8f0;border-radius:12px;">
                <tr>
                  <td style="padding:16px 18px;">
                    <p style="margin:0 0 6px;color:#64748b;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">Employee Details</p>
                    <p style="margin:0 0 4px;color:#64748b;font-size:13px;">Name</p>
                    <p style="margin:0 0 12px;color:#0B1F3A;font-size:15px;font-weight:600;">${employeeName}</p>
                    <p style="margin:0 0 4px;color:#64748b;font-size:13px;">Work Email</p>
                    <p style="margin:0;color:#0B1F3A;font-size:15px;font-weight:600;">${employeeEmail}</p>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;color:#64748b;font-size:13px;font-weight:600;">Invitation Code</p>
              <p style="margin:0 0 20px;padding:14px 16px;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;color:#0B1F3A;font-size:22px;letter-spacing:0.08em;font-family:Consolas,Monaco,monospace;font-weight:700;">${invitationCode}</p>
              <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6;">Please provide this invitation code to the employee so they can complete their first-time login.</p>
              <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6;"><strong>Important:</strong> This invitation code is valid for ${hours} hour${hours === 1 ? '' : 's'} and can only be used once.</p>
              <p style="margin:28px 0;">
                <a href="${loginUrl}" style="display:inline-block;background:#1D4ED8;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:10px;">Open First-Time Login</a>
              </p>
              <p style="margin:0;color:#64748b;font-size:13px;line-height:1.5;">Do not forward this email except to the employee named above.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;background:#F8FAFC;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px;">
              Regards,<br/>CareYu Automation<br/>Project Management System<br/><br/>
              Need help? Contact <a href="mailto:${env.supportEmail}" style="color:#1D4ED8;text-decoration:none;">${env.supportEmail}</a><br/>
              © ${new Date().getFullYear()} CareYu Automation. All rights reserved.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    `Hello ${input.managerName},`,
    '',
    'A new employee has requested access to the CareYu Automation Project Management Tool.',
    '',
    'Employee Details:',
    `Name: ${input.employeeName}`,
    `Work Email: ${input.employeeEmail}`,
    '',
    `Invitation Code: ${input.invitationCode}`,
    '',
    'Please provide this invitation code to the employee so they can complete their first-time login.',
    `Important: This invitation code is valid for ${hours} hours and can only be used once.`,
    '',
    `First-time login: ${loginUrl}`,
    '',
    'Regards,',
    'CareYu Automation',
    'Project Management System',
  ].join('\n');

  const allowedManagerEmail = (env.defaultReportingManagerEmail || 'robotlead1@careyu.ai').toLowerCase();
  if (input.managerEmail.trim().toLowerCase() !== allowedManagerEmail) {
    console.error('[auth] Invitation email blocked: recipient is not the configured reporting manager', {
      attempted: input.managerEmail,
      allowed: allowedManagerEmail,
    });
    return {
      id: 'blocked',
      to_user_id: input.managerUserId,
      to_email: input.managerEmail,
      to_name: input.managerName,
      subject: `New CareYu Account Invitation Request – ${input.employeeName}`,
      body: '[REDACTED]',
      status: 'FAILED' as const,
      created_at: new Date().toISOString(),
      deliveryMode: 'blocked',
    };
  }

  return sendTransactionalEmail({
    toEmail: input.managerEmail,
    toName: input.managerName,
    toUserId: input.managerUserId,
    subject: `New CareYu Account Invitation Request – ${input.employeeName}`,
    html,
    text,
  });
}

export async function sendWelcomeEmail(input: {
  toEmail: string;
  toName: string;
  toUserId: string;
}) {
  const content = brandedEmailLayout({
    title: 'Your CareYu Account Is Ready',
    preheader: 'Your CareYu Automation account has been activated.',
    greeting: `Hello ${input.toName},`,
    paragraphs: [
      'Your CareYu Automation Project Management Tool account is now active.',
      'You can sign in using your work email and the password you created.',
    ],
    ctaLabel: 'Sign In',
    ctaUrl: `${env.frontendUrl}/login`,
    footerNote: 'If you did not create this account, contact Admin immediately.',
  });

  return sendTransactionalEmail({
    toEmail: input.toEmail,
    toName: input.toName,
    toUserId: input.toUserId,
    subject: 'Your CareYu account is ready',
    ...content,
  });
}
