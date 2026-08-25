import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { initStore, shutdownStore } from './store/db.js';
import authRouter from './routes/auth.js';
import masterRouter from './routes/master.js';
import dashboardRouter from './routes/dashboard.js';
import leadsRouter from './routes/leads.js';
import notificationsRouter from './routes/notifications.js';
import escalationsRouter from './routes/escalations.js';
import projectsRouter from './routes/projects.js';
import operationsRouter from './routes/operations.js';
import dailyUpdatesRouter from './routes/dailyUpdates.js';
import planningRouter from './routes/planning.js';
import usersRouter from './routes/users.js';
import documentsRouter from './routes/documents.js';
import chatRouter from './routes/chat.js';
import forumRouter from './routes/forum.js';
import tasksRouter from './routes/tasks.js';
import { startNotificationScheduler } from './lib/reminderJob.js';

const app = express();

function isAllowedOrigin(origin: string | undefined) {
  if (!origin) return true;
  if (env.corsOrigins.includes(origin)) return true;
  if (env.nodeEnv === 'production') return false;
  try {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1') return true;
    if (/^10\./.test(url.hostname) || /^192\.168\./.test(url.hostname)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(url.hostname)) return true;
    return false;
  } catch {
    return false;
  }
}

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        callback(null, origin || true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json({ limit: '20mb' }));

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
app.use('/api/daily-updates', dailyUpdatesRouter);
app.use('/api/planning', planningRouter);
app.use('/api/users', usersRouter);
app.use('/api/chat', chatRouter);
app.use('/api/forum', forumRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api', documentsRouter);
app.use('/api', operationsRouter);
app.use('/api', masterRouter);

async function start() {
  const storeInfo = await initStore();
  console.log(
    `Store ready (source=${storeInfo.source}, users=${storeInfo.counts.users}, leads=${storeInfo.counts.leads}, projects=${storeInfo.counts.projects})`
  );

  const server = app.listen(env.port, '0.0.0.0', () => {
    console.log(`Careyu backend running on http://localhost:${env.port}`);
  });
  startNotificationScheduler();

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.error(
        `Port ${env.port} is already in use by another application. Stop that process or set PORT in backend/.env to a free port.`
      );
      process.exit(1);
    }
    throw error;
  });

  const shutdown = async (signal: string) => {
    console.log(`${signal} received, shutting down...`);
    server.close(async () => {
      await shutdownStore();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

start().catch((error) => {
  console.error('Failed to start backend:', error);
  process.exit(1);
});
