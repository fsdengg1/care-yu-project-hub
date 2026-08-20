import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { store } from '../store/db.js';

const router = Router();

router.post('/login', (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!email) {
    return res.status(400).json({ message: 'Work email is required.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Enter a valid work email address.' });
  }
  if (!password) {
    return res.status(400).json({ message: 'Password is required.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters.' });
  }

  const user = store.findUserByEmail(email);
  if (!user || password !== env.demoPassword) {
    return res.status(401).json({ message: 'Invalid email or password. Please try again.' });
  }
  if (user.status !== 'ACTIVE') {
    return res.status(403).json({ message: 'This account is inactive. Contact Admin for assistance.' });
  }

  return res.json({
    token: issueToken(user),
    user,
  });
});

function issueToken(user: { id: string; role_code: string; email: string }) {
  return jwt.sign(
    { sub: user.id, role: user.role_code, email: user.email },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'] }
  );
}

router.post('/restore-session', (req, res) => {
  const userId = typeof req.body?.userId === 'string' ? req.body.userId : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const target = userId ? store.findUserById(userId) : email ? store.findUserByEmail(email) : undefined;
  if (!target || target.status !== 'ACTIVE') {
    return res.status(401).json({ message: 'Not authenticated.' });
  }
  return res.json({ token: issueToken(target), user: target });
});

router.post('/impersonate', (req, res) => {
  if (env.nodeEnv === 'production') {
    return res.status(403).json({ message: 'Forbidden. This action is not permitted for your role.' });
  }

  const userId = typeof req.body?.userId === 'string' ? req.body.userId : '';
  const target = store.findUserById(userId);
  if (!target || target.status !== 'ACTIVE') {
    return res.status(404).json({ message: 'User not found.' });
  }

  return res.json({ token: issueToken(target), user: target });
});

router.get('/me', (req, res) => {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    return res.status(401).json({ message: 'Not authenticated.' });
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret) as { sub: string };
    const user = store.findUserById(payload.sub);
    if (!user) {
      return res.status(401).json({ message: 'Not authenticated.' });
    }
    return res.json({ user });
  } catch {
    return res.status(401).json({ message: 'Session expired. Please sign in again.' });
  }
});

export default router;
