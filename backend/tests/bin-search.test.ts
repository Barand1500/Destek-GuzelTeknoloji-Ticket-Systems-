import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchBinRecords } from '../src/services/bin-search.service.js';
import type { Actor } from '../src/types/express.js';

const admin: Actor = { id: 'admin', name: 'Admin', email: '', role: 'ADMIN', departmentIds: [], sessionId: '' };
const customer: Actor = { id: 'customer', name: 'Customer', email: '', role: 'CUSTOMER', departmentIds: [], sessionId: '' };

test('BIN search finds records by prefix and bank name, and rejects customers', async () => {
  const byBin = await searchBinRecords(admin, { search: '454671' });
  assert.ok(byBin.data.some(record => record.bin === '454671' && record.bankName === 'Ziraat Bankası'));
  assert.ok(byBin.data.every(record => record.bin.startsWith('454671')));

  const byName = await searchBinRecords(admin, { search: 'ziraat' });
  assert.ok(byName.total >= 50);
  assert.ok(byName.data.every(record => `${record.bankName} ${record.issuer}`.toLocaleLowerCase('tr-TR').includes('ziraat')));

  const enpara = await searchBinRecords(admin, { search: '526911' });
  assert.equal(enpara.data[0]?.bankName, 'Enpara');
  assert.equal(enpara.data[0]?.bankKey, 'enpara');

  await assert.rejects(searchBinRecords(customer, { search: '454671' }), { code: 'FORBIDDEN' });
});
