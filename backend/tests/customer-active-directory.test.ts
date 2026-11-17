import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {db} from '../src/config/db.js';
import {users} from '../src/services/management.service.js';
import {directoryQuery} from '../src/validators/management.js';
import type {Actor} from '../src/types/express.js';
after(async()=>db.$disconnect());
test('customer directory can filter active contacts without hiding inactive management records',async()=>{
 const name='Active directory '+randomUUID();
 const records=await Promise.all([true,false].map(isActive=>db.user.create({data:{name,role:'CUSTOMER',passwordHash:'fixture',isActive}})));
 const actor:Actor={id:'fixture-admin',name:'Admin',email:'',role:'ADMIN',sessionId:'',departmentIds:[]};
 try{
  const all=await users(actor,directoryQuery.parse({search:name}),true);assert.equal(all.data.length,2);
  const active=await users(actor,directoryQuery.parse({search:name,isActive:'true'}),true);assert.equal(active.data.length,1);assert.equal(active.data[0].id,records[0].id);
  const inactive=await users(actor,directoryQuery.parse({search:name,isActive:'false'}),true);assert.equal(inactive.data.length,1);assert.equal(inactive.data[0].id,records[1].id);
 }finally{await db.user.deleteMany({where:{id:{in:records.map(row=>row.id)}}});}
});
