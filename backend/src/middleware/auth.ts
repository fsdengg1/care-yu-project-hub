import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { isFullyActivated } from '../lib/authUser.js';
import { store } from '../store/db.js';
import { User } from '../types.js';

export interface AuthedRequest extends Request {
  user?: User;
  passwordSetup?: boolean;
}

function readBearer(req: Request): string {
  const header = req.headers.authorization ?? '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = readBearer(req);
  if (!token) {
    return res.status(401).json({ message: 'Not authenticated.' });
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret) as { sub: string; purpose?: string };
    if (payload.purpose === 'password_setup') {
      return res.status(401).json({ message: 'Please create your password to continue.' });
    }
    const user = store.findUserById(payload.sub);
    if (!user || !isFullyActivated(user)) {
      return res.status(401).json({ message: 'Not authenticated.' });
    }
    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ message: 'Session expired. Please sign in again.' });
  }
}

export function requirePasswordSetupOrInitialPassword(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = readBearer(req);
  if (!token) {
    return res.status(401).json({ message: 'Invitation verification is required before creating a password.' });
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret) as { sub: string; purpose?: string };
    const user = store.findUserById(payload.sub);
    if (!user || user.status !== 'ACTIVE') {
      return res.status(401).json({ message: 'Invitation verification is required before creating a password.' });
    }

    if (payload.purpose === 'password_setup') {
      if (user.invitation_used_at && user.password_hash) {
        return res.status(409).json({
          code: 'used',
          message: 'This invitation code has already been used. Please sign in using your password.',
        });
      }
      req.user = user;
      req.passwordSetup = true;
      return next();
    }

    if (!isFullyActivated(user)) {
      return res.status(401).json({ message: 'Not authenticated.' });
    }
    if (user.password_hash) {
      return res.status(409).json({ message: 'A password already exists for this account. Use Change Password instead.' });
    }
    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ message: 'Your invitation session has expired. Please sign in with your invitation code again.' });
  }
}
