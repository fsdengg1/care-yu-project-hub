import { promises as dns } from 'node:dns';
import { env } from '../config/env.js';

export const ELASTIC_API = 'https://api.elasticemail.com/v4';

export function senderDomain() {
  const at = env.emailFrom.lastIndexOf('@');
  return at > 0 ? env.emailFrom.slice(at + 1).toLowerCase() : '';
}

export function emailConfigSnapshot() {
  const domain = senderDomain();
  return {
    provider: env.emailProvider,
    apiKey: env.emailApiKey ? ('configured' as const) : ('missing' as const),
    sender: env.emailFrom ? ('configured' as const) : ('missing' as const),
    senderEmail: env.emailFrom,
    senderName: env.emailFromName,
    senderDomain: domain || 'unknown',
    debug: env.emailDebug,
  };
}

export function maskEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  const at = normalized.indexOf('@');
  if (at <= 0) return '***';
  return `${normalized[0]}***@${normalized.slice(at + 1)}`;
}

export function logEmailConfigOnStartup() {
  const snapshot = emailConfigSnapshot();
  console.info('[EMAIL] Provider:', snapshot.provider);
  console.info('[EMAIL] API key configured:', snapshot.apiKey === 'configured' ? 'YES' : 'NO');
  console.info('[EMAIL] Sender configured:', snapshot.sender === 'configured' ? 'YES' : 'NO', snapshot.senderEmail ? `(${snapshot.senderEmail})` : '');
  if (snapshot.provider === 'elasticemail' && snapshot.apiKey === 'missing') {
    console.error(
      '[EMAIL] Elastic Email cannot send: API key is missing. Set ELASTIC_EMAIL_API_KEY in the backend environment.'
    );
  }
  if (snapshot.provider === 'console') {
    console.warn('[EMAIL] EMAIL_PROVIDER=console. Messages are logged locally and are not delivered to inboxes.');
  }
}

export function redactEmailSecrets(value: string) {
  let next = value;
  if (env.emailApiKey) next = next.split(env.emailApiKey).join('[REDACTED]');
  return next
    .replace(/CY-[A-Z0-9]{4}-[A-Z0-9]{4}/gi, '[REDACTED]')
    .replace(/([?&]token=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [REDACTED]')
    .replace(/X-ElasticEmail-ApiKey["']?\s*[:=]\s*["']?[^"'\s]+/gi, 'X-ElasticEmail-ApiKey=[REDACTED]');
}

export function emailDebugLog(message: string, details?: Record<string, unknown>) {
  if (!env.emailDebug) return;
  if (details) console.info(`[EMAIL] ${message}`, details);
  else console.info(`[EMAIL] ${message}`);
}

export function emailErrorLog(message: string, details?: Record<string, unknown>) {
  if (details) console.error(`[EMAIL] ${message}`, details);
  else console.error(`[EMAIL] ${message}`);
}

export async function inspectDomainAuth(domain = senderDomain()) {
  const result = {
    domain: domain || 'unknown',
    spf: 'UNKNOWN' as 'PASS' | 'FAIL' | 'UNKNOWN',
    dkim: 'UNKNOWN' as 'PASS' | 'FAIL' | 'UNKNOWN',
    dmarc: 'UNKNOWN' as 'PASS' | 'FAIL' | 'UNKNOWN',
    notes: [] as string[],
  };
  if (!domain) {
    result.notes.push(
      'Sender domain could not be determined from ELASTIC_EMAIL_FROM_EMAIL / ELASTIC_EMAIL_SENDER_EMAIL.'
    );
    return result;
  }

  try {
    const txt = await dns.resolveTxt(domain);
    const joined = txt.map((parts) => parts.join('')).join(' | ');
    if (/v=spf1/i.test(joined)) {
      result.spf = /elasticemail|_spf\.elasticemail/i.test(joined) ? 'PASS' : 'FAIL';
      if (result.spf === 'FAIL') {
        result.notes.push(`SPF is published for ${domain} but does not include Elastic Email (_spf.elasticemail.com).`);
      }
    } else {
      result.spf = 'FAIL';
      result.notes.push(`No SPF TXT record (v=spf1) found on ${domain}.`);
    }
  } catch {
    result.spf = 'UNKNOWN';
    result.notes.push(`Could not look up SPF TXT records for ${domain}.`);
  }

  const dkimSelectors = ['api._domainkey', 'mail._domainkey', 's1._domainkey', 's2._domainkey', 'elasticemail._domainkey'];
  let dkimFound = false;
  for (const selector of dkimSelectors) {
    const host = `${selector}.${domain}`;
    try {
      const cname = await dns.resolveCname(host);
      if (cname.length) {
        dkimFound = true;
        break;
      }
    } catch {
      /* try TXT */
    }
    try {
      const txt = await dns.resolveTxt(host);
      if (txt.some((parts) => /v=DKIM1|dkim/i.test(parts.join('')))) {
        dkimFound = true;
        break;
      }
    } catch {
      /* next selector */
    }
  }
  result.dkim = dkimFound ? 'PASS' : 'UNKNOWN';
  if (!dkimFound) {
    result.notes.push(
      `No common Elastic Email DKIM selector was found for ${domain}. Confirm DKIM in the Elastic Email dashboard and publish the CNAME/TXT records they provide.`
    );
  }

  try {
    const dmarc = await dns.resolveTxt(`_dmarc.${domain}`);
    const joined = dmarc.map((parts) => parts.join('')).join(' ');
    result.dmarc = /v=DMARC1/i.test(joined) ? 'PASS' : 'FAIL';
    if (result.dmarc === 'FAIL') result.notes.push(`_dmarc.${domain} exists but is not a DMARC record.`);
  } catch {
    result.dmarc = 'FAIL';
    result.notes.push(`No DMARC record found at _dmarc.${domain}.`);
  }

  return result;
}

export async function fetchElasticTransactionStatus(transactionId: string) {
  if (!env.emailApiKey || !transactionId) return null;
  const params = new URLSearchParams({
    showFailed: 'true',
    showSent: 'true',
    showDelivered: 'true',
    showPending: 'true',
    showErrors: 'true',
  });
  const response = await fetch(`${ELASTIC_API}/emails/${encodeURIComponent(transactionId)}/status?${params.toString()}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'X-ElasticEmail-ApiKey': env.emailApiKey,
    },
  });
  const raw = await response.text();
  let data: Record<string, unknown> = {};
  try {
    data = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return { httpStatus: response.status, raw: redactEmailSecrets(raw).slice(0, 400) };
  }
  if (!response.ok) {
    return {
      httpStatus: response.status,
      error: redactEmailSecrets(String(data.Error || data.message || raw)).slice(0, 400),
    };
  }

  const deliveredCount = Number(data.DeliveredCount ?? 0);
  const failedCount = Number(data.FailedCount ?? 0);
  const pendingCount = Number(data.PendingCount ?? 0);
  const sentCount = Number(data.SentCount ?? 0);
  let deliveryStatus: 'Delivered' | 'Bounced' | 'Failed' | 'Pending' | 'Accepted' | 'Unknown' = 'Unknown';
  if (deliveredCount > 0) deliveryStatus = 'Delivered';
  else if (failedCount > 0) deliveryStatus = 'Bounced';
  else if (pendingCount > 0) deliveryStatus = 'Pending';
  else if (sentCount > 0) deliveryStatus = 'Accepted';

  return {
    httpStatus: response.status,
    deliveryStatus,
    status: data.Status,
    deliveredCount,
    failedCount,
    pendingCount,
    sentCount,
  };
}
