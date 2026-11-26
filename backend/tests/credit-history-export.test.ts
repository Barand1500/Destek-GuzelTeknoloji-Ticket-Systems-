import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { exportCreditHistory } from '../src/services/credit-history-export.js';

test('exports real XLSX with Istanbul dates, numeric credits, Turkish text and literal user content', async () => {
  const person = { id: 'person', name: 'Çağrı Şahin' }, agreement = { id: 'grant', name: 'Yıllık Paket' };
  const buffer = await exportCreditHistory({ people: [person], agreements: [agreement], data: [
    { createdAt: new Date('2026-11-25T09:15:00Z'), credits: 500, kind: 'USED', agreement, conversation: { number: 517, subject: '=HYPERLINK("https://example.test")', customer: person } },
    { createdAt: new Date('2026-11-25T10:15:00Z'), credits: 20, kind: 'RETURNED', agreement, conversation: { number: 517, subject: 'Tekrar açıldı', customer: person } },
  ] }, { view: 'movements', personId: person.id, agreementId: agreement.id, startsOn: '2026-11-01', endsOn: '2026-11-30' }, 'Güzel Teknoloji');
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  assert.equal(sheet.getCell('A1').value, 'Güzel Teknoloji');
  assert.match(String(sheet.getCell('A3').value), /01.11.2026/);
  assert.match(String(sheet.getCell('A4').value), /Çağrı Şahin/);
  assert.equal(sheet.getCell('A7').type, ExcelJS.ValueType.Date);
  assert.equal((sheet.getCell('A7').value as Date).toISOString(), '2026-11-25T12:15:00.000Z');
  assert.equal(sheet.getCell('D7').type, ExcelJS.ValueType.String);
  assert.equal(sheet.getCell('B7').value, person.name);
  assert.equal(sheet.getCell('G7').value, -500);
  assert.equal(sheet.getCell('G8').value, 20);
  assert.equal(sheet.getCell('G9').value, -480);
  assert.ok(sheet.autoFilter);
  assert.equal(sheet.views[0].state, 'frozen');
});

test('exports person totals as numbers, including zero and empty reports', async () => {
  const buffer = await exportCreditHistory({ people: [], agreements: [], data: [{ id: 'a', name: 'Özge', ticketCount: 4, net: 250 }, { id: 'b', name: 'Baran', ticketCount: 1, net: 0 }] }, { view: 'people' }, 'Şirket');
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  assert.equal(sheet.columnCount, 3);
  assert.equal(sheet.getCell('B7').value, 4);
  assert.equal(sheet.getCell('C8').value, 0);
  assert.equal(sheet.getCell('B9').value, 5);
  assert.equal(sheet.getCell('C9').value, 250);
  const empty = await exportCreditHistory({ people: [], agreements: [], data: [] }, { view: 'people' }, 'Şirket');
  await workbook.xlsx.load(empty);
  assert.equal(workbook.worksheets[0].getCell('C7').value, 0);
});
