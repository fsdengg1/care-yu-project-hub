import { Router } from 'express';
import { publicUser } from '../lib/authUser.js';
import { store } from '../store/db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/users', requireAuth, (_req, res) => {
  res.json({ users: store.getUsers().map((user) => publicUser(user)) });
});

router.get('/roles', requireAuth, (_req, res) => {
  res.json({ roles: store.getRoles() });
});

router.get('/teams', requireAuth, (_req, res) => {
  res.json({ teams: store.getTeams() });
});

export default router;
