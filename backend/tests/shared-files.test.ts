import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { db } from '../src/config/db.js';
import * as files from '../src/services/shared-files.service.js';
import { withStoredUploads, uploadRoot } from '../src/services/uploads.service.js';
import type { Actor } from '../src/types/express.js';

test('shared files are visible to different administrators, protect ownership and delete nested contents', async () => {
  const suffix = randomUUID();
  const actor = (id: string, role = 'ADMIN') => ({ id, name: id, email: '', role, departmentIds: [], sessionId: suffix } as Actor);
  const a = actor(`shared-test-a-${suffix}`), b = actor(`shared-test-b-${suffix}`);
  const owner = {...actor(`shared-test-owner-${suffix}`,'AGENT'), rolePermissions: ['files.view','files.create','files.update','files.delete']};
  const other = {...owner, id: `shared-test-other-${suffix}`};
  const ids: string[] = [];
  try {
    const root = await files.createSharedFolder(a,{name:`Shared ${suffix}`,parent:null,icon:'folder',color:'blue'}); ids.push(root.id);
    assert.ok((await files.sharedFiles(b)).some(item=>item.id===root.id));
    await files.updateSharedFile(b,root.id,{name:`Renamed ${suffix}`,icon:'folder',color:'green'});
    assert.equal((await files.sharedFiles(a)).find(item=>item.id===root.id)?.name,`Renamed ${suffix}`);
    const nested = await files.createSharedFolder(owner,{name:'Nested',parent:root.id,icon:'folder',color:'blue'}); ids.push(nested.id);
    await assert.rejects(files.updateSharedFile(other,nested.id,{name:'Unauthorized',icon:'folder',color:'blue'}),/yetkiniz/);
    await assert.rejects(files.deleteSharedFile(other,nested.id),/yetkiniz/);
    const uploaded = await withStoredUploads([{originalname:'shared.txt',mimetype:'text/plain',size:5,buffer:Buffer.from('hello')} as Express.Multer.File],stored=>files.uploadSharedFiles(owner,nested.id,stored)); ids.push(uploaded[0].id);
    const download = await files.sharedFileDownload(b,uploaded[0].id);
    assert.equal((await readFile(path.join(uploadRoot,download.storageKey!))).toString(),'hello');
    await files.deleteSharedFile(b,root.id);
    assert.equal(await db.sharedFile.count({where:{id:{in:ids}}}),0);
    await assert.rejects(readFile(path.join(uploadRoot,download.storageKey!)));
    assert.ok(!(await files.sharedFiles(a)).some(item=>ids.includes(item.id)));
    await assert.rejects(files.sharedFiles(actor('customer','CUSTOMER')),/yetkiniz/);
  } finally {
    for(const id of ids.reverse()) if(await db.sharedFile.findUnique({where:{id}}))await files.deleteSharedFile(a,id);
    await db.$disconnect();
  }
});
