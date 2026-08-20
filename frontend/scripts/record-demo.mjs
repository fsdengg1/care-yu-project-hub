import { mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync('D:\\ms-playwright')) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = 'D:\\ms-playwright';
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DEMO_DIR = process.env.DEMO_DIR || (existsSync('D:\\') ? 'D:\\care-yu-demo' : join(ROOT, 'demo'));
const VIDEO_OUT = join(DEMO_DIR, 'care-yu-vision-demo.webm');
const BASE = process.env.DEMO_URL || 'http://localhost:3000';
const TITLE = 'Automotive Brake Disc Vision Inspection System';

async function caption(page, text) {
  await page.evaluate((t) => {
    let el = document.getElementById('cya-demo-caption');
    if (!el) {
      el = document.createElement('div');
      el.id = 'cya-demo-caption';
      el.style.cssText = [
        'position:fixed',
        'left:24px',
        'bottom:24px',
        'z-index:99999',
        'background:#0f172a',
        'border:1px solid #22d3ee',
        'color:#e2e8f0',
        'padding:12px 18px',
        'border-radius:12px',
        'font:600 15px/1.45 system-ui,Segoe UI,sans-serif',
        'max-width:560px',
        'box-shadow:0 0 0 1px #0e7490 inset',
        'pointer-events:none',
      ].join(';');
      document.body.appendChild(el);
    }
    el.textContent = t;
  }, text);
}

async function pause(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  if (!existsSync(DEMO_DIR)) mkdirSync(DEMO_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: false,
    slowMo: 280,
    channel: 'chrome',
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: {
      dir: DEMO_DIR,
      size: { width: 1440, height: 900 },
    },
  });

  const page = await context.newPage();

  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByText('Careyu Automation').first().waitFor();

    await caption(page, '1. Login as Sharadha Patil (Business Head)');
    await page.locator('[data-demo="login-email"]').fill('shradha.patil@careyu.com');
    await page.locator('[data-demo="login-password"]').fill('Careyu@123');
    await pause(900);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForURL('**/dashboard**');
    await page.getByText('Sharadha Patil').first().waitFor();
    await pause(1200);

    await caption(page, '2. Create Vision Project — Leads & Pipeline');
    await page.getByRole('link', { name: 'Leads & Pipeline' }).click();
    await page.getByRole('heading', { name: 'Leads & Pipeline Management' }).waitFor();
    await pause(700);
    await page.getByRole('link', { name: 'Create New Lead' }).click();
    await page.getByRole('heading', { name: 'Pre-Sales Lead Form' }).waitFor();
    await pause(600);

    await caption(page, '3. Auto-fill vision project details');
    await page.locator('[data-demo="load-vision"]').click();
    await page.locator('input[placeholder="e.g. Automotive Brake Disc Vision Inspection System"]').waitFor();
    await pause(800);

    const sections = [
      'Section A — Basic Lead Information',
      'Section B — Customer Contact Information',
      'Section C — Customer Requirement Details',
      'Section D — Technical Information (Optional Initial Inputs)',
      'Section E — Commercial Information (Optional)',
    ];
    for (const heading of sections) {
      await page.getByText(heading, { exact: true }).scrollIntoViewIfNeeded();
      await pause(900);
    }
    await page.getByText('Section A — Basic Lead Information', { exact: true }).scrollIntoViewIfNeeded();
    await pause(500);

    await caption(page, '4. Submit to PM — status becomes Pending PM Review');
    await page.locator('[data-demo="submit-to-pm"]').click();
    await page.waitForURL('**/pre-sales/leads');
    await page.locator('tbody').getByText(TITLE).waitFor();
    await page.locator('tbody').getByText('SUBMITTED TO PM').waitFor();
    await pause(1600);

    await caption(page, '5. Switch to Arivan (Project Manager)');
    await page.getByText('DEMO ROLE CONTEXT:').click();
    await page.getByRole('button', { name: /Arivan/ }).click();
    await page.getByText('Arivan').first().waitFor();
    await pause(800);

    await page.getByRole('link', { name: 'Leads & Pipeline' }).click();
    await page.getByText('LEADS AWAITING PM REVIEW').waitFor();
    await pause(1200);

    await caption(page, '6. Arivan reviews the vision lead');
    const reviewRow = page.locator('div').filter({ hasText: TITLE }).filter({ has: page.getByRole('link', { name: /Review Lead/ }) }).first();
    await reviewRow.getByRole('link', { name: /Review Lead/ }).click();
    await page.getByText('PM Decision Panel (Arivan)').waitFor();
    await pause(1400);

    await caption(page, '7. Accept for Feasibility');
    await page.locator('[data-demo="accept-feasibility"]').click();
    await page.getByText('LEAD ACCEPTED FOR FEASIBILITY').waitFor();
    await pause(1400);

    await caption(page, '8. Assign Vision Team');
    await page.getByRole('button', { name: 'Go to Feasibility Teams' }).click();
    await page.getByText('No teams assigned yet.').waitFor();
    await pause(700);
    await page.locator('[data-demo="add-first-team"]').click();
    await page.getByText(/Add Team to/).waitFor();
    await pause(500);

    await page.locator('#demo-team-select').selectOption({ label: 'Vision Team' });
    await pause(400);
    await page.locator('#demo-due-date').fill('2026-09-15');
    await page.getByPlaceholder('Scope of feasibility evaluation for this team…').fill(
      'Evaluate Cognex 2D camera FOV, lighting, and cycle-time feasibility for 280 mm brake discs. Confirm reject handshake with Siemens S7-1500.'
    );
    await page.getByPlaceholder('e.g. Optical FOV & Lighting Feasibility Report').fill(
      'Optical FOV & Lighting Feasibility Report'
    );
    await pause(900);

    await page.getByRole('button', { name: 'Assign to Team Lead' }).click();
    await page.getByText('Vision Team').first().waitFor();
    await page.getByText('PENDING_TEAM_LEAD_REVIEW').waitFor();

    await caption(page, 'Done — Sharadha created · Arivan accepted · Vision Team assigned to Vani');
    await pause(2800);
  } catch (err) {
    await page.screenshot({ path: join(DEMO_DIR, 'demo-error.png'), fullPage: true });
    throw err;
  } finally {
    const video = page.video();
    await page.close();
    if (video) {
      await video.saveAs(VIDEO_OUT);
      await video.delete();
    }
    await context.close();
    await browser.close();
  }

  console.log(`Demo video saved: ${VIDEO_OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
