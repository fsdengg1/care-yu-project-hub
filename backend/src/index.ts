import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import authRouter from './routes/auth.js';
import masterRouter from './routes/master.js';

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
app.use('/api', masterRouter);

app.listen(env.port, () => {
  console.log(`Careyu backend running on http://localhost:${env.port}`);
});
