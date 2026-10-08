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
}
async function shot(name) {
  await ready();
  await page.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
  captured.push(name);
  console.log(`Captured ${name}`);
}
async function visit(route, name) {
  await page.goto(route);
  await shot(name);
}
try {
  await page.goto('/login');
  await page.getByLabel('E-posta adresi').fill(process.env.GUIDE_ADMIN_EMAIL || process.env.SEED_ADMIN_EMAIL);
  await page.getByLabel('Şifre', { exact: true }).fill(process.env.GUIDE_ADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Giriş yap', exact: true }).click();
  await page.waitForURL('**/admin/dashboard');
  await shot('genel-bakis');
  await visit('/admin/conversations', 'gelen-kutusu');
  const conversationURL = await page.locator('a[href^="/admin/conversations/"]').first().getAttribute('href');
  await visit('/admin/customers', 'musteriler');
  await shot('musteriler-liste');
  const customerChoice = page.getByRole('link', { name: 'Görüşmeleri aç', exact: true }).first();
  await customerChoice.click();
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
  await page.getByRole('button', { name: 'Yeni kişi ekle', exact: true }).click();
  await shot('telefon-yeni-kisi');
  if (!conversationURL) throw new Error('A conversation is required to capture its detail screen.');
  await visit(conversationURL, 'konusma-detayi');
  await page.goto('/admin/guide/system');
  await ready();
  const guideImages = page.locator('.guide-page img');
  if (await guideImages.count() !== 5) throw new Error('Expected five illustrated guide sections.');
  for (const img of await guideImages.all()) {
    await img.scrollIntoViewIfNeeded();
    await img.evaluate(element => element.decode());
    if (!await img.evaluate(element => element.naturalWidth > 0)) throw new Error('A guide image failed to load.');
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(output, 'rehber-kontrol.png'), animations: 'disabled' });
  console.log('Guide images rendered successfully.');
  if (process.argv.includes('--publish')) {
    for (const name of captured) {
      await copyFile(path.join(output, `${name}.png`), path.resolve('frontend/public/guide', `${name}.png`));
    }
    console.log('Guide images updated. Review the numbered annotations in Guide.tsx.');
  }
} finally {
  await context.close();
  await browser.close();
}
