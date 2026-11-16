import { createConversationSchema } from '../backend/src/validators/index';
﻿import { test, expect } from '@playwright/test';
test('customer ticket form uses projects and detail hides staff controls', async ({ page }) => {
 const customer = { id: 'customer', name: 'Müşteri', role: 'CUSTOMER', email: 'customer@example.test' };
 const requests: string[] = [];
 await page.route('**/socket.io/**', route => route.abort());
 await page.route('**/api/v1/**', async route => {
  const path = new URL(route.request().url()).pathname.replace('/api/v1', ''); requests.push(path);
  const send = (data: unknown) => route.fulfill({ json: { success: true, data, pagination: { page: 1, totalPages: 1, total: 1, limit: 15 } } });
  if(path === '/conversations' && route.request().method() === 'POST') {
   const req = route.request();
   const form = await new Request(req.url(), { method: 'POST', headers: { 'content-type': req.headers()['content-type'] }, body: req.postDataBuffer()! }).formData();
   const input = Object.fromEntries(form.entries());
   expect(createConversationSchema.safeParse(input).success).toBe(true);
   return send({ id: 'ticket' });
  }
  if(path === '/auth/refresh') return send({ accessToken: 'test', user: customer });
  if(path === '/conversations/project-options') return send([{id:'11111111-1111-4111-8111-111111111111', name:'Örnek Proje'}]);
  if(path === '/departments') return send([{id:'22222222-2222-4222-8222-222222222222',name:'Teknik Destek'}]);
  if(path === '/conversations/ticket') return send({id:'ticket',number:1,subject:'Örnek talep',customerId:'customer',customer,department:{id:'22222222-2222-4222-8222-222222222222',name:'Teknik Destek'},channel:'TICKET',status:'OPEN',priority:'NORMAL',tags:[],assignees:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
  return send([]);
 });
 await page.addInitScript(() => localStorage.setItem('helpdesk-theme', 'dark'));
 await page.goto('/customer/tickets/new');
 await expect(page.getByText('Size Nasıl Yardımcı Olabiliriz?')).toBeVisible();
 await expect(page.getByText('Etiket / Görünüm', {exact:true})).toHaveCount(0);
 await page.getByLabel('Proje', {exact:true}).click();
 await expect(page.getByText('Örnek Proje', {exact:true})).toBeVisible();
 await page.getByRole('option', {name:'Örnek Proje',exact:true}).click();
 await page.getByPlaceholder('Talebinizi kısaca özetleyin').fill('Deneme');
 await page.getByPlaceholder('Neler olduğunu ve size nasıl yardımcı olabileceğimizi paylaşın…').fill('Deneme açıklama');
 await expect(page.locator('textarea[name="message"]')).toHaveCSS('resize','none');
 await page.getByLabel('Departman',{exact:true}).click();
 await page.getByRole('option',{name:'Teknik Destek',exact:true}).click();
 await page.getByRole('button',{name:'Talep Oluştur',exact:true}).click();
 await expect(page).toHaveURL(/customer\/tickets\/ticket$/);
 await expect(page.getByRole('heading',{name:'Talep Bilgileri'})).toBeVisible();
 await expect(page.getByLabel('Görüşmeyi Sil',{exact:true})).toHaveCount(0);
 await expect(page.getByText('Departmana Aktar',{exact:true})).toHaveCount(0);
 await expect(page.getByText('Atanan Personeller',{exact:true})).toHaveCount(0);
 await expect(page.getByRole('button', {name:'Proje',exact:true})).toBeVisible();
 await expect(page.locator('.customer-ticket-property').filter({hasText:'Destek personeli'})).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
 expect(requests).not.toContain('/websites');
 expect(requests.some(path=>path.endsWith('/agents'))).toBe(false);
});

