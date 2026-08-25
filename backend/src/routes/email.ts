import { Router } from 'express';
import { AuthedRequest, requireAuth } from '../middleware/auth.js';
import { clientKey, rateLimit } from '../lib/rateLimit.js';
import { sendTestEmail } from '../lib/email.js';
import {
  emailConfigSnapshot,
  fetchElasticTransactionStatus,
  inspectDomainAuth,
} from '../lib/emailDiagnostics.js';
import { store } from '../store/db.js';
import { env } from '../config/env.js';

const router = Router();

function canManageEmail(user?: { role_code?: string }) {
  return Boolean(user && ['SYSTEM_ADMIN', 'CEO', 'CTO'].includes(user.role_code || ''));
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

router.use(requireAuth);

router.get('/status', async (req: AuthedRequest, res) => {
  if (!canManageEmail(req.user)) {
    return res.status(403).json({ message: 'Forbidden. This action is not permitted for your role.' });
  }
  const config = emailConfigSnapshot();
  const domain = await inspectDomainAuth();
  const recent = store
    .getOutboundEmails()
    .slice(0, 8)
    .map((item) => ({
      to: item.to_email,
      subject: item.subject,
      status: item.status,
      created_at: item.created_at,
      transactionId: item.transaction_id,
    }));

  let transaction = null;
  const transactionId = readString(req.query.transactionId).trim();
  if (transactionId && env.emailApiKey) {
    try {
      transaction = await fetchElasticTransactionStatus(transactionId);
    } catch {
      transaction = { error: 'Unable to query Elastic Email status.' };
    }
  }

  return res.json({
    provider: 'Elastic Email',
    backendIntegration: config.provider === 'elasticemail' ? 'PASS' : 'FAIL',
    apiKey: config.apiKey,
    sender: config.sender,
    senderEmail: config.senderEmail,
    senderName: config.senderName,
    domain: domain.domain,
    domainAuth: {
      spf: domain.spf,
      dkim: domain.dkim,
      dmarc: domain.dmarc,
    },
    notes: domain.notes,
    debug: config.debug,
    recent,
    transaction,
  });
});

router.post('/test', async (req: AuthedRequest, res) => {
  if (!canManageEmail(req.user)) {
    return res.status(403).json({ message: 'Forbidden. This action is not permitted for your role.' });
  }
  const limited = rateLimit({
    key: clientKey(req, `email-test:${req.user?.id || 'anon'}`),
    limit: 6,
    windowMs: 15 * 60 * 1000,
  });
  if (!limited.ok) {
    res.setHeader('Retry-After', String(limited.retryAfterSec));
    return res.status(429).json({ message: 'Too many requests. Please try again shortly.', code: 'RATE_LIMITED' });
  }

  const to = readString(req.body?.to || req.body?.toEmail).trim().toLowerCase();
  const result = await sendTestEmail(to);
  if (!result.ok) {
    return res.status(result.reason?.includes('valid recipient') ? 400 : 502).json({
      message: result.reason || 'Email delivery failed.',
      deliveryMode: result.deliveryMode,
      transactionId: result.transactionId,
    });
  }
  return res.json({
    message: 'Email accepted by Elastic Email.',
    transactionId: result.transactionId,
    deliveryMode: result.deliveryMode,
  });
});

export default router;
