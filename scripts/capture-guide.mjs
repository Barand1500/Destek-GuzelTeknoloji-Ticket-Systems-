import path from 'node:path';
import { mkdir, copyFile } from 'node:fs/promises';
import dotenv from 'dotenv';
import { chromium } from '@playwright/test';

dotenv.config({ path: 'backend/.env', quiet: true });
const baseURL = process.env.GUIDE_BASE_URL || 'http://localhost:5173';
const output = path.resolve(process.env.GUIDE_OUTPUT_DIR || '.local/guide-capture');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: process.env.GUIDE_BROWSER || 'chrome' });
const context = await browser.newContext({ viewport: { width: 1915, height: 941 }, baseURL });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const captured = [];
await context.addInitScript(() => localStorage.setItem('helpdesk-theme', 'light'));
async function ready() {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.locator('main').waitFor();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForFunction(() => !/yükleniyor/i.test(document.querySelector('main')?.textContent || ''));
}
async function shot(name) {
  await ready();
  await page.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled', fullPage: name === 'konusma-detayi' });
  captured.push(name);
  console.log(`Captured ${name}`);
}
async function visit(route, name) {
  await page.goto(route);
  await shot(name);
}
try {
  await page.goto('/login');
  await page.locator('.auth-form input[name="email"]').fill(process.env.GUIDE_ADMIN_EMAIL || process.env.SEED_ADMIN_EMAIL);
  await page.locator('.auth-form input[name="password"]').fill(process.env.GUIDE_ADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD);
  await page.locator('.auth-form .button.primary').click();
  await page.waitForURL('**/admin/dashboard');
  if (!process.argv.includes('--verify-only')) {
    await shot('genel-bakis');
    await page.goto('/admin/conversations');
    await page.locator('a[href^="/admin/conversations/"]').first().waitFor();
    await shot('gelen-kutusu');
    const openConversation = page.locator('tr:has(.status-OPEN) a[href^="/admin/conversations/"]').first();
    const conversationURL = await (await openConversation.count() ? openConversation : page.locator('a[href^="/admin/conversations/"]').first()).getAttribute('href');
    await visit('/admin/customers', 'musteriler');
    await shot('musteriler-liste');
    const customerChoice = page.locator('.management-table tbody tr').first();
    await customerChoice.click();
    await page.getByRole('button', { name: 'Görüşmeler', exact: true }).click();
    await page.locator('.customer-request-card').first().waitFor();
    await shot('musteri-gelen-kutusu');
    await page.goto('/admin/phone-support');
    await ready();
    await page.locator('.phone-support-search input').fill('m');
    await page.locator('.customer-choice').first().waitFor();
    await shot('telefon-arama');
    await page.locator('.customer-choice').first().click();
    await shot('telefon-mevcut-kisi');
    await page.goto('/admin/phone-support');
    await ready();
    await page.getByRole('button', { name: 'Yeni Kişi Ekle', exact: true }).click();
    await shot('telefon-yeni-kisi');
    if (!conversationURL) throw new Error('A conversation is required to capture its detail screen.');
    await visit(conversationURL, 'konusma-detayi');
    if (process.argv.includes('--publish')) {
      for (const name of captured) {
        await copyFile(path.join(output, `${name}.png`), path.resolve('frontend/public/guide', `${name}.png`));
      }
    }
  }
  await page.goto('/admin/guide/system');
  await ready();
  const guideImages = page.locator('.guide-page img');
  if (await guideImages.count() !== 5) throw new Error('Expected five illustrated guide sections.');
  for (const img of await guideImages.all()) {
    await img.scrollIntoViewIfNeeded();
    await img.evaluate(element => element.decode());
    if (!await img.evaluate(element => element.naturalWidth > 0)) throw new Error('A guide image failed to load.');
  }
  for (const tabs of await page.locator('.guide-shot-tabs').all()) {
    for (const tab of await tabs.getByRole('tab').all()) {
      await tab.click();
      const img = tabs.locator('..').locator('img');
      await img.evaluate(element => element.decode());
      if (!await img.evaluate(element => element.naturalWidth > 0)) throw new Error('A guide image variant failed to load.');
    }
    await tabs.getByRole('tab').first().click();
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(output, 'rehber-kontrol.png'), animations: 'disabled' });
  console.log('Guide images rendered successfully.');
  if (process.argv.includes('--publish')) {
    console.log('Guide images updated. Review the numbered annotations in Guide.tsx.');
  }
} catch (error) {
  let message = error instanceof Error ? error.message : String(error);
  for (const key of ['GUIDE_ADMIN_EMAIL', 'SEED_ADMIN_EMAIL', 'GUIDE_ADMIN_PASSWORD', 'SEED_ADMIN_PASSWORD']) {
    if (process.env[key]) message = message.replaceAll(process.env[key], '[redacted]');
  }
  console.error(message);
  process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
}
