import cron from 'node-cron';
import { env } from '../config/env.js';
import { sendConfiguredEmailReport } from './emailReportSchedule.js';

let started = false;

async function runSlot(slot: 'noon' | 'evening') {
  try {
    const result = await sendConfiguredEmailReport({ slot, source: 'schedule' });
    if (result.skipped) {
      console.info(`[email-report-scheduler] ${slot} skipped: ${result.message}`);
      return;
    }
    if (!result.ok) {
      console.error(`[email-report-scheduler] ${slot} failed: ${result.message}`);
      return;
    }
    console.info(`[email-report-scheduler] ${slot} ok: ${result.message}`);
  } catch (error) {
    console.error(`[email-report-scheduler] ${slot} crashed`, error);
  }
}

export function startEmailReportScheduler() {
  if (started || !env.schedulerEnabled) return;
  started = true;
  const timezone = env.appTimezone || 'Asia/Kolkata';

  cron.schedule(
    '0 12 * * *',
    () => {
      void runSlot('noon');
    },
    { timezone }
  );

  cron.schedule(
    '15 19 * * *',
    () => {
      void runSlot('evening');
    },
    { timezone }
  );

  console.log(
    `[scheduler] email report jobs started (12:00 and 19:15, timezone=${timezone})`
  );
}
