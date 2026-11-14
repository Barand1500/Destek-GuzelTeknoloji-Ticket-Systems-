import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from '../src/config/db.js';
import { createAgreementType, archiveAgreementType, listAgreementTypes, createAgreement, listAgreements, listRelationCandidates } from '../src/services/agreements.service.js';
import type { Actor } from '../src/types/express.js';
test('Custom types preserve history after archive; relation search paginates eligible body results', async () => {
  const suffix = randomUUID(), ids: string[] = [];
  const actor: Actor = { id: '', name: 'Type staff', role: 'ADMIN', email: '', departmentIds: [], sessionId: '' };
  let typeId = '';
  try {
    const staff = await db.user.create({ data: { role: 'ADMIN', name: actor.name, passwordHash: 'test' } }); ids.push(staff.id); actor.id = staff.id;
    const parent = await db.user.create({ data: { role: 'CUSTOMER', name: 'Type parent ' + suffix, passwordHash: 'test' } }); ids.push(parent.id);
    const client: Actor = { ...actor, id: parent.id, role: 'CUSTOMER' };
    await assert.rejects(createAgreementType(client, 'Denied'));
    await assert.rejects(createAgreementType({ ...actor, role: 'AGENT', rolePermissions: ['customers.view'] }, 'Denied'));
    await assert.rejects(createAgreementType(actor, 'Aylık'));
    const type = await createAgreementType(actor, 'Özel ' + suffix); typeId = type.id;
    await assert.rejects(createAgreementType(actor, type.name));
    const agreement = await createAgreement(actor, parent.id, { name: 'Custom', type: type.id, startsOn: '2020-01-01', endsOn: '2099-01-01', fee: '0', credits: 5 });
    assert.equal((await listAgreements(client, parent.id)).agreements[0].typeLabel, type.name);
    await assert.rejects(archiveAgreementType(actor, 'MONTHLY'));
    await archiveAgreementType(actor, type.id);
    assert.equal((await listAgreementTypes(actor)).some(t => t.id === type.id), false);
    assert.equal((await listAgreements(client, parent.id)).agreements.find(a => a.id === agreement.id)?.typeLabel, type.name);
    await assert.rejects(createAgreement(actor, parent.id, { name: 'Invalid archived', type: type.id, startsOn: '2020-01-01', endsOn: '2099-01-01', fee: '0', credits: 5 }));
    assert.equal((await createAgreementType(actor, type.name)).id, type.id);
    for (let i = 0; i < 13; i++) { const row = await db.user.create({ data: { role: 'CUSTOMER', name: 'Candidate ' + suffix + ' ' + String(i).padStart(2, '0'), passwordHash: 'test', ...(i === 0 ? { parentCustomerId: parent.id } : {}) } }); ids.push(row.id); }
    const first = await listRelationCandidates(actor, parent.id, { direction: 'CHILD', search: suffix, page: 1, limit: 5 });
    const second = await listRelationCandidates(actor, parent.id, { direction: 'CHILD', search: suffix, page: 2, limit: 5 });
    assert.equal(first.pagination.total, 12); assert.equal(first.data.length, 5); assert.equal(second.data.length, 5);
    assert.equal(first.data.some(a => second.data.some(b => a.id === b.id)), false);
    assert.equal(first.data.some(a => a.id === ids[2] || a.id === parent.id), false);
    await assert.rejects(listRelationCandidates(client, parent.id, { direction: 'CHILD', search: suffix, page: 1, limit: 5 }));
  } finally {
    await db.agreement.deleteMany({ where: { customerId: { in: ids } } });
    if (typeId) await db.agreementType.deleteMany({ where: { id: typeId } });
    await db.activityLog.deleteMany({ where: { userId: { in: ids } } });
    await db.user.updateMany({ where: { id: { in: ids } }, data: { parentCustomerId: null } });
    await db.user.deleteMany({ where: { id: { in: ids } } }); await db.$disconnect();
  }
});
