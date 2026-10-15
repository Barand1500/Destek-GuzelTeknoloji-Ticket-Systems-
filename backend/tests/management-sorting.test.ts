import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from '../src/config/db.js';
import * as management from '../src/services/management.service.js';
import { managementOrder, sortManagementRows } from '../src/services/management-sorting.js';
import { directoryQuery, searchQuery, notificationQuery, activityQuery } from '../src/validators/management.js';
import { nextTableSort, sortTableRows } from '../../frontend/src/components/TableSorting.tsx';

test('one active column cycles ascending, descending and default; switching columns starts ascending', () => {
  const ascending = nextTableSort(null, 'name');
  const descending = nextTableSort(ascending, 'name');
  assert.deepEqual(ascending, { sortBy: 'name', sortDirection: 'asc' });
  assert.deepEqual(descending, { sortBy: 'name', sortDirection: 'desc' });
  assert.equal(nextTableSort(descending, 'name'), null);
  assert.deepEqual(nextTableSort(descending, 'createdAt'), { sortBy: 'createdAt', sortDirection: 'asc' });
  for (const schema of [directoryQuery, searchQuery, notificationQuery, activityQuery]) {
    assert.equal(schema.safeParse({ sortBy: 'createdAt', sortDirection: 'desc' }).success, true);
    assert.equal(schema.safeParse({ sortBy: 'passwordHash', sortDirection: 'desc' }).success, false);
    assert.equal(schema.safeParse({ sortBy: 'name', sortDirection: 'invalid' }).success, false);
  }
  const fallback = [{ name: 'asc' as const }];
  assert.deepEqual(managementOrder({}, { name: direction => ({ name: direction }) }, fallback), fallback);
  assert.deepEqual(managementOrder({ sortBy: 'invalid', sortDirection: 'desc' }, { name: direction => ({ name: direction }) }, fallback), fallback);
});

test('Turkish sorting includes local category rows and restores their original order', () => {
  const rows = [{ id: 'view', name: 'Şablon' }, { id: 'db-1', name: 'İleti' }, { id: 'db-2', name: 'Zaman' }];
  assert.deepEqual(sortTableRows(rows, { sortBy: 'name', sortDirection: 'asc' }, item => item.name).map(item => item.id), ['db-1', 'view', 'db-2']);
  assert.deepEqual(sortTableRows(rows, null, item => item.name), rows);
  assert.deepEqual(sortManagementRows(rows, { sortBy: 'name', sortDirection: 'desc' }, { name: item => item.name }).map(item => item.id), ['db-2', 'view', 'db-1']);
});

test('management tables sort all matching records before pagination and keep their defaults', async () => {
  const suffix = randomUUID();
  const people: string[] = [], tagIds: string[] = [], websites: string[] = [], replies: string[] = [], templates: string[] = [], notifications: string[] = [], logs: string[] = [], statuses: string[] = [], priorities: string[] = [];
  try {
    for (const [index, name] of ['Zulu', 'Alpha', 'Middle'].entries()) {
      const role = (['AGENT', 'SUPERVISOR', 'ADMIN'] as const)[index];
      const person = await db.user.create({ data: { name: `${name} ${suffix}`, passwordHash: 'test-only', role } });
      people.push(person.id);
      const tag = await db.tag.create({ data: { name: `${name} ${suffix}`, code: `${index}_${suffix}` } }); tagIds.push(tag.id);
      const site = await db.website.create({ data: { name: `${name} ${suffix}`, url: `https://${index}.example.test/${suffix}` } }); websites.push(site.id);
      const reply = await db.savedReply.create({ data: { title: `${name} ${suffix}`, body: `${index} ${suffix}`, authorId: person.id } }); replies.push(reply.id);
      const template = await db.announcementTemplate.create({ data: { label: `${name} ${suffix}`, title: `${index} ${suffix}`, body: `${name} ${suffix}`, sortOrder: index } }); templates.push(template.id);
      const status = await db.statusOption.create({ data: { name: `${name} ${suffix}`, code: `${index}_${suffix}` } }); statuses.push(status.id);
      const priority = await db.priorityOption.create({ data: { name: `${name} ${suffix}`, code: `${index}_${suffix}` } }); priorities.push(priority.id);
    }
    const actor = { id: people[2], name: 'Admin', email: '', role: 'ADMIN' as const, departmentIds: [], sessionId: 'test' };
    for (let index = 0; index < 3; index++) {
      const date = new Date(`${2020 + index}-01-01T00:00:00Z`);
      const notification = await db.notification.create({ data: { userId: actor.id, type: 'TEST', title: `${['Zulu', 'Alpha', 'Middle'][index]} ${suffix}`, message: `${index} ${suffix}`, createdAt: date } }); notifications.push(notification.id);
      const log = await db.activityLog.create({ data: { userId: people[index], entityType: 'Test', entityId: suffix, action: ['conversation.deleted', 'profile.updated', 'conversation.created'][index], metadata: { name: ['Zulu', 'Alpha', 'Middle'][index] }, createdAt: date } }); logs.push(log.id);
    }
    const q = { page: 1, limit: 1, search: suffix };
    const ascending = { ...q, sortDirection: 'asc' as const }, descending = { ...q, sortDirection: 'desc' as const };
    assert.equal((await management.users(actor, { ...ascending, sortBy: 'name' })).data[0].id, people[1]);
    assert.equal((await management.users(actor, { ...descending, sortBy: 'name' })).data[0].id, people[0]);
    assert.equal((await management.users(actor, { ...ascending, sortBy: 'roleDepartments', page: 2 })).data[0].id, people[0]);
    assert.equal((await management.users(actor, q)).data[0].id, people[1]);
    assert.equal((await management.tags({ ...ascending, sortBy: 'code', page: 2 })).data[0].id, tagIds[1]);
    assert.equal((await management.tags({ ...descending, sortBy: 'name' })).data[0].id, tagIds[0]);
    assert.equal((await management.tags(q)).data[0].id, tagIds[1]);
    assert.equal((await management.statusOptions({ ...descending, sortBy: 'code' })).data[0].id, statuses[2]);
    assert.equal((await management.priorityOptions({ ...descending, sortBy: 'name' })).data[0].id, priorities[0]);
    assert.equal((await management.websites({ ...descending, sortBy: 'url' })).data[0].id, websites[2]);
    assert.equal((await management.websites(q)).data[0].id, websites[1]);
    assert.equal((await management.savedReplies(actor, { ...descending, sortBy: 'body' })).data[0].id, replies[2]);
    assert.equal((await management.savedReplies(actor, { ...ascending, sortBy: 'author' })).data[0].id, replies[1]);
    assert.equal((await management.savedReplies(actor, q)).data[0].id, replies[1]);
    assert.equal((await management.announcementTemplates(actor, { ...ascending, sortBy: 'label' })).data[0].id, templates[1]);
    assert.equal((await management.announcementTemplates(actor, { ...descending, sortBy: 'title' })).data[0].id, templates[2]);
    assert.equal((await management.announcementTemplates(actor, q)).data[0].id, templates[0]);
    assert.equal((await management.notifications(actor, { ...ascending, sortBy: 'createdAt' })).data[0].id, notifications[0]);
    assert.equal((await management.notifications(actor, { ...descending, sortBy: 'message', page: 2 })).data[0].id, notifications[1]);
    assert.equal((await management.notifications(actor, q)).data[0].id, notifications[2]);
    assert.equal((await management.activityLogs(actor, { ...ascending, sortBy: 'createdAt' })).data[0].id, logs[0]);
    assert.equal((await management.activityLogs(actor, { ...ascending, sortBy: 'user' })).data[0].id, logs[1]);
    assert.equal((await management.activityLogs(actor, { ...ascending, sortBy: 'action' })).data[0].id, logs[1], 'sort translated actions, not technical keys');
    assert.equal((await management.activityLogs(actor, { ...ascending, sortBy: 'description', page: 2 })).data[0].id, logs[2]);
    assert.equal((await management.activityLogs(actor, q)).data[0].id, logs[2]);
    assert.equal((await management.activityLogs(actor, q)).pagination.total, 3);
  } finally {
    await db.activityLog.deleteMany({ where: { id: { in: logs } } });
    await db.notification.deleteMany({ where: { id: { in: notifications } } });
    await db.announcementTemplate.deleteMany({ where: { id: { in: templates } } });
    await db.savedReply.deleteMany({ where: { id: { in: replies } } });
    await db.statusOption.deleteMany({ where: { id: { in: statuses } } });
    await db.priorityOption.deleteMany({ where: { id: { in: priorities } } });
    await db.tag.deleteMany({ where: { id: { in: tagIds } } });
    await db.website.deleteMany({ where: { id: { in: websites } } });
    await db.user.deleteMany({ where: { id: { in: people } } });
    await db.$disconnect();
  }
});
