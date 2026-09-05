import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { initStore, isStoreInitialized, shutdownStore } from './store/db.js';
import authRouter from './routes/auth.js';
import masterRouter from './routes/master.js';
import dashboardRouter from './routes/dashboard.js';
import leadsRouter from './routes/leads.js';
import notificationsRouter from './routes/notifications.js';
import escalationsRouter from './routes/escalations.js';
import projectsRouter from './routes/projects.js';
import operationsRouter from './routes/operations.js';
import dailyUpdatesRouter from './routes/dailyUpdates.js';
import dailyStatusRouter from './routes/dailyStatus.js';
import planningRouter from './routes/planning.js';
import usersRouter from './routes/users.js';
import documentsRouter from './routes/documents.js';
import chatRouter from './routes/chat.js';
import forumRouter from './routes/forum.js';
import tasksRouter from './routes/tasks.js';
import { startNotificationScheduler } from './lib/reminderJob.js';
import { startEmailReportScheduler } from './lib/emailReportJob.js';
import { logEmailConfigOnStartup } from './lib/emailDiagnostics.js';
import { ensureLiveDirectory } from './lib/directoryRoles.js';
import { ensureRobotLeadAccount } from './lib/robotLead.js';
import { ensureActionItemTasks } from './lib/actionItemSheet.js';
import { migrateLiveDemoGate } from './lib/liveDemonstration.js';
import liveDemonstrationsRouter from './routes/liveDemonstrations.js';
import emailRouter from './routes/email.js';

const app = express();

function isLoopbackHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function isPrivateLanHost(hostname: string) {
  return (
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  );
}

function isAllowedOrigin(origin: string | undefined) {
  if (!origin) return true;
  const incoming = origin.replace(/\/$/, '');
  if (env.corsOrigins.includes(incoming)) return true;
  try {
    const url = new URL(incoming);
    const swapped = new URL(incoming);
    if (url.hostname === 'localhost') swapped.hostname = '127.0.0.1';
    else if (url.hostname === '127.0.0.1') swapped.hostname = 'localhost';
    if (swapped.origin !== url.origin && env.corsOrigins.includes(swapped.origin)) return true;
    if (env.nodeEnv === 'production') return false;
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    return isLoopbackHost(url.hostname) || isPrivateLanHost(url.hostname);
  } catch {
    return false;
  }
}

const corsOptions: cors.CorsOptions = {
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, origin || true);
      return;
    }
    callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Accept',
    'Origin',
    'X-Requested-With',
    'X-File-Name',
    'X-File-Type',
    'X-File-Size',
    'X-Mime-Type',
    'X-Entity-Type',
    'X-Entity-Id',
  ],
  exposedHeaders: ['Content-Type'],
  optionsSuccessStatus: 204,
  maxAge: 86400,
};

app.use((_req, res, next) => {
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});
app.use(cors(corsOptions));
app.options('/{*path}', cors(corsOptions));
app.use(express.json({ limit: '20mb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'careyu-backend',
    env: env.nodeEnv,
    store: isStoreInitialized() ? 'ready' : 'starting',
  });
});

app.use('/api/auth', authRouter);
app.use('/api/email', emailRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/leads', leadsRouter);
app.use('/api/live-demonstrations', liveDemonstrationsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/escalations', escalationsRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/daily-updates', dailyUpdatesRouter);
app.use('/api/daily-status', dailyStatusRouter);
app.use('/api/planning', planningRouter);
app.use('/api/users', usersRouter);
app.use('/api/chat', chatRouter);
app.use('/api/forum', forumRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api', documentsRouter);
app.use('/api', operationsRouter);
app.use('/api', masterRouter);

async function start() {
  console.log('Starting CareYu backend...');
  console.log(`[boot] NODE_ENV=${env.nodeEnv} PORT=${env.port} databaseSsl=${env.databaseSsl}`);

  const storeInfo = await initStore();
  console.log(
    `Store ready (source=${storeInfo.source}, users=${storeInfo.counts.users}, pendingSignups=${storeInfo.counts.pendingSignups ?? 0}, leads=${storeInfo.counts.leads}, projects=${storeInfo.counts.projects})`
  );
  await ensureLiveDirectory();
  await ensureRobotLeadAccount();
  ensureActionItemTasks();
  logEmailConfigOnStartup();
  startNotificationScheduler();
  startEmailReportScheduler();

  const server = app.listen(env.port, '0.0.0.0', () => {
    console.log(`Careyu backend listening on 0.0.0.0:${env.port}`);
    try {
      const liveDemoMigration = migrateLiveDemoGate();
      console.log(
        `[live-demo] gate migration activated=${liveDemoMigration.activated} exempt=${liveDemoMigration.exempt}${liveDemoMigration.backup ? ` backup=${liveDemoMigration.backup}` : ''}`
      );
    } catch (error) {
      console.error('[live-demo] gate migration skipped so login can continue:', error);
    }
  });

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

