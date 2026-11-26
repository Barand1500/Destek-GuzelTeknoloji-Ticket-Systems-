import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Prisma } from '../src/generated/prisma/client.js';
import { creditHistoryReport } from '../src/services/credit-history-report.js';

test('company report counts returned cycles, filters before paging, and preserves company scope', async () => {
  const conversation = (id: string, name: string) => ({ id, number: 1, subject: 'Support', customer: { id, name } });
  const first = conversation('person-a', 'A'), second = conversation('person-b', 'B');
  const grant = { id: 'grant', name: 'Package' };
  const scope = { OR: [{ conversation: { customerId: 'company' } }, { agreement: { customerId: 'company' } }] };
  const tx = {
    conversation: { findMany: async (args: { where: unknown }) => {
      assert.deepEqual(args.where, { OR: [{ OR: [{ customerId: 'company' }] }, { creditCharge: { is: scope } }] });
      return [first, second];
    } },
    creditCharge: { findMany: async () => [
      { id: 'current-a', credits: 30, createdAt: new Date('2026-11-25T09:00:00Z'), agreementId: 'grant', agreement: grant, conversation: first },
      { id: 'current-b', credits: 20, createdAt: new Date('2026-11-25T10:00:00Z'), agreementId: 'grant', agreement: grant, conversation: second },
    ] },
    activityLog: { findMany: async () => [{ id: 'return-a', entityId: first.id, createdAt: new Date('2026-11-25T08:00:00Z'), metadata: { credits: 10, agreementId: 'grant', chargeId: 'old-a', chargedAt: '2026-11-24T22:00:00Z' } }] },
    agreement: { findMany: async () => [grant] },
  } as unknown as Prisma.TransactionClient;
  const result = await creditHistoryReport(tx, scope, { view: 'people', page: 1, limit: 1 });
  assert.deepEqual(result.summary, { spent: 60, returned: 10, net: 50, tickets: 2 });
  assert.equal(result.pagination.total, 2);
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].id, first.id);
  const exported = await creditHistoryReport(tx, scope, { view: 'people', page: 1, limit: 1, allRecords: true });
  assert.equal(exported.data.length, 2);
  const filtered = await creditHistoryReport(tx, scope, { view: 'movements', personId: first.id, agreementId: 'grant', startsOn: '2026-11-25', endsOn: '2026-11-25', page: 1, limit: 20 });
  assert.deepEqual(filtered.summary, { spent: 40, returned: 10, net: 30, tickets: 1 });
  assert.deepEqual(filtered.data.map(row => row.id), ['current-a', 'return-a', 'old-a']);
  await assert.rejects(() => creditHistoryReport(tx, scope, { startsOn: '2026-11-26', endsOn: '2026-11-25', page: 1, limit: 20 }));
});
