import { Router } from 'express';
import { store } from '../store/db.js';

const router = Router();

router.get('/users', (_req, res) => {
  res.json({ users: store.getUsers() });
});

router.get('/roles', (_req, res) => {
  res.json({ roles: store.getRoles() });
});

router.get('/teams', (_req, res) => {
  res.json({ teams: store.getTeams() });
});

export default router;
