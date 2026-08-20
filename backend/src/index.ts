import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import authRouter from './routes/auth.js';
import masterRouter from './routes/master.js';
import dashboardRouter from './routes/dashboard.js';
import leadsRouter from './routes/leads.js';
import notificationsRouter from './routes/notifications.js';
import escalationsRouter from './routes/escalations.js';
import projectsRouter from './routes/projects.js';
import operationsRouter from './routes/operations.js';

const app = express();

app.use(
  cors({
    origin: env.corsOrigins,
    credentials: true,
  })
);
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'careyu-backend',
    env: env.nodeEnv,
  });
});

app.use('/api/auth', authRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/leads', leadsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/escalations', escalationsRouter);
app.use('/api/projects', projectsRouter);
app.use('/api', operationsRouter);
app.use('/api', masterRouter);

app.listen(env.port, () => {
  console.log(`Careyu backend running on http://localhost:${env.port}`);
});
