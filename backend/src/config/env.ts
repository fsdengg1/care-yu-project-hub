import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

function stripEnvValue(value: string | undefined): string {
  return (value ?? '').trim().replace(/^['"]|['"]$/g, '').trim();
}

function loadBackendEnv() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, '../../.env'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(here, '../../../backend/.env'),
  ];
  const envPath = candidates.find((candidate) => fs.existsSync(candidate));
  const assignIfUnset = (key: string, raw: string | undefined) => {
    const value = stripEnvValue(raw);
    if (!value) return;
    // Platform env (Render, etc.) always wins over a committed/local .env file.
    if (process.env[key] == null || process.env[key] === '') {
      process.env[key] = value;
    }
  };

  if (!envPath) {
    dotenv.config({ quiet: true, override: false });
    return;
  }
  const parsed = dotenv.parse(fs.readFileSync(envPath));
  for (const [key, raw] of Object.entries(parsed)) {
    assignIfUnset(key, raw);
  }
}

loadBackendEnv(); // load backend/.env once at process start




function required(name: string, fallback?: string): string {
  const value = stripEnvValue(process.env[name]) || fallback;
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Set it in the Render Environment tab (or backend/.env locally).`
    );
  }
  return value;
}

function firstEnv(...names: string[]): string {
  for (const name of names) {
    const value = stripEnvValue(process.env[name]);
    if (value) return value;
  }
  return '';
}

function parseAllowedEmailDomains(): string[] {
  const multi = process.env.ALLOWED_EMAIL_DOMAINS;
  const single = process.env.ALLOWED_EMAIL_DOMAIN;
  const raw = multi?.trim() || single?.trim() || 'careyu.ai';
  const domains = raw
    .split(',')
    .map((part) => part.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);
  return [...new Set(domains)];
}

function parseEmailProvider(): string {
  const explicit = (process.env.EMAIL_PROVIDER ?? '').trim().toLowerCase();
  if (explicit === 'elastic' || explicit === 'elastic-email') return 'elasticemail';
  if (explicit) return explicit;
  if (firstEnv('ELASTIC_EMAIL_API_KEY')) return 'elasticemail';
  return 'console';
}

function parseEmailList(raw: string | undefined, extras: string[] = []): string[] {
  const listed = (raw ?? '')
    .split(/[,;]+/)
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.includes('@'));
  return [...new Set([...listed, ...extras])];
}

function firstEmailAddress(raw: string | undefined, fallback: string): string {
  return parseEmailList(raw)[0] || fallback;
}

function normalizeOrigin(value: string): string {
  return value.trim().replace(/\/$/, '');
}

function localhostAlias(origin: string): string | null {
  try {
    const url = new URL(origin);
    if (url.hostname === 'localhost') {
      url.hostname = '127.0.0.1';
      return url.origin;
    }
    if (url.hostname === '127.0.0.1') {
      url.hostname = 'localhost';
      return url.origin;
    }
    return null;
  } catch {
    return null;
  }
}

function parseCorsOrigins(): string[] {
  const listed = (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean);
  const frontend = normalizeOrigin(process.env.FRONTEND_URL ?? '');
  const origins = new Set(listed);
  if (frontend) origins.add(frontend);
  for (const origin of [...origins]) {
    const alias = localhostAlias(origin);
    if (alias) origins.add(alias);
  }
  return [...origins];
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  jwtSecret: required('JWT_SECRET', 'careyu-dev-jwt-secret-change-in-production'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
  jwtRememberExpiresIn: process.env.JWT_REMEMBER_EXPIRES_IN ?? '30d',
  demoPassword: required('DEMO_PASSWORD', 'Careyu@123'),
  robotLeadEmail: (process.env.ROBOT_LEAD_EMAIL ?? 'robottech@careyu.ai').trim().toLowerCase(),
  robotLeadPassword: stripEnvValue(process.env.ROBOT_LEAD_PASSWORD) || 'Careyu@9865',
  databaseUrl: required('DATABASE_URL'),
  /** Aiven and most managed Postgres require SSL; set DATABASE_SSL=false only for local Postgres without TLS. */
  databaseSsl: (process.env.DATABASE_SSL ?? 'true').toLowerCase() !== 'false',
  frontendUrl: (process.env.FRONTEND_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
  /** Prefer ALLOWED_EMAIL_DOMAINS; ALLOWED_EMAIL_DOMAIN kept for backward compatibility. */
  allowedEmailDomains: parseAllowedEmailDomains(),
  emailProvider: parseEmailProvider(),
  emailApiKey: firstEnv('ELASTIC_EMAIL_API_KEY', 'EMAIL_API_KEY'),
  emailFrom: firstEnv('ELASTIC_EMAIL_FROM_EMAIL', 'ELASTIC_EMAIL_SENDER_EMAIL', 'EMAIL_FROM') || 'noreply@careyu.ai',
  emailFromName: firstEnv('ELASTIC_EMAIL_FROM_NAME', 'ELASTIC_EMAIL_SENDER_NAME', 'EMAIL_FROM_NAME') || 'CareYu Automation',
  emailReplyTo: process.env.EMAIL_REPLY_TO ?? '',
  emailDebug: (process.env.EMAIL_DEBUG ?? 'false').toLowerCase() === 'true',
  supportEmail: process.env.SUPPORT_EMAIL ?? 'admin@careyu.ai',
  /** SMTP / Amazon SES SMTP (used when EMAIL_PROVIDER=smtp) */
  smtpHost: process.env.SMTP_HOST ?? '',
  smtpPort: Number(process.env.SMTP_PORT ?? 587),
  smtpSecure: (process.env.SMTP_SECURE ?? 'false').toLowerCase() === 'true',
  smtpUser: process.env.SMTP_USER ?? '',
  smtpPass: process.env.SMTP_PASS ?? '',
  emailVerificationTtlHours: Number(process.env.EMAIL_VERIFICATION_TTL_HOURS ?? 24),
  passwordResetTtlMinutes: Number(
    process.env.PASSWORD_RESET_EXPIRY_MINUTES ?? process.env.PASSWORD_RESET_TTL_MINUTES ?? 30
  ),
  invitationTtlHours: Number(process.env.INVITATION_EXPIRY_HOURS ?? process.env.INVITATION_TTL_HOURS ?? 24),
  passwordSetupTtlMinutes: Number(process.env.PASSWORD_SETUP_TTL_MINUTES ?? 30),
  defaultReportingManagerEmail: firstEmailAddress(
    process.env.DEFAULT_REPORTING_MANAGER_EMAIL,
    'robotlead1@careyu.ai'
  ),
  invitationNotifyEmails: parseEmailList(
    process.env.INVITATION_NOTIFY_EMAILS ?? 'fsdengg1@careyu.ai',
    parseEmailList(process.env.DEFAULT_REPORTING_MANAGER_EMAIL ?? 'robotlead1@careyu.ai')
  ),
  /** Development-only impersonation. Never enable in production. */
  enableDevRolePreview:
    (process.env.ENABLE_DEV_ROLE_PREVIEW ?? 'false').toLowerCase() === 'true' &&
    (process.env.NODE_ENV ?? 'development') !== 'production',
  corsOrigins: parseCorsOrigins(),
  reminderAfterHours: Number(process.env.REMINDER_AFTER_HOURS ?? 24),
  maxReminders: Number(process.env.MAX_REMINDERS ?? 3),
  escalationAfterReminders: Number(process.env.ESCALATION_AFTER_REMINDERS ?? 3),
  dailyDigestEnabled: (process.env.DAILY_DIGEST_ENABLED ?? 'true').toLowerCase() === 'true',
  schedulerEnabled: (process.env.NOTIFICATION_SCHEDULER_ENABLED ?? 'true').toLowerCase() !== 'false',
  defaultProjectManagerEmail: (process.env.DEFAULT_PROJECT_MANAGER_EMAIL ?? '').trim().toLowerCase(),
};
