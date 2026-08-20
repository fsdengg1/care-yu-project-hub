import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { store } from '../store/db.js';
import { User } from '../types.js';

export interface AuthedRequest extends Request {
  user?: User;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    return res.status(401).json({ message: 'Not authenticated.' });
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret) as { sub: string };
    const user = store.findUserById(payload.sub);
    if (!user || user.status !== 'ACTIVE') {
      return res.status(401).json({ message: 'Not authenticated.' });
    }
    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ message: 'Session expired. Please sign in again.' });
  }
}
