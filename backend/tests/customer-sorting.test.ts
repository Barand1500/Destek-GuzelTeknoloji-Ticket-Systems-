import 'dotenv/config';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {db} from '../src/config/db.js';
import {users} from '../src/services/management.service.js';
import {customerListOrder} from '../src/services/customer-sorting.js';
import {directoryQuery, customerUpdateFields, updateCustomerSchema} from '../src/validators/management.js';
test('customer name sorting retains newest-created default ordering',()=>{
 assert.deepEqual(customerListOrder(),[{createdAt:'desc'},{id:'desc'}]);
 assert.deepEqual(customerListOrder('asc'),[{name:'asc'},{createdAt:'desc'},{id:'desc'}]);
 assert.deepEqual(customerListOrder('desc'),[{name:'desc'},{createdAt:'desc'},{id:'desc'}]);
 assert.equal(directoryQuery.safeParse({nameSort:'invalid'}).success,false);
 assert.equal(directoryQuery.safeParse({companySort:'invalid'}).success,false);
 assert.equal(customerUpdateFields.safeParse({}).success,true);
 assert.equal(updateCustomerSchema.safeParse({}).success,false);
 assert.equal(customerUpdateFields.safeParse({name:''}).success,false);
});
test('customer ordering applies before pagination and keeps the search filter',async()=>{
 const suffix=randomUUID();const ids:string[]=[];
 const actor={id:randomUUID(),name:'Test admin',email:'',role:'ADMIN' as const,departmentIds:[],sessionId:'test'};
 try{
  for(const [name,year] of [['Alpha',2020],['Zulu',2021],['Middle',2022]] as const){
   const customer=await db.user.create({data:{name:`${name} ${suffix}`,company: name === 'Alpha' ? 'Zulu Company' : name === 'Zulu' ? 'Alpha Company' : 'Middle Company',role:'CUSTOMER',passwordHash:'test-only',createdAt:new Date(`${year}-01-01T00:00:00Z`)}});ids.push(customer.id);
  }
  const q={page:1,limit:1,search:suffix};
  assert.equal((await users(actor,{...q,nameSort:'asc'},true)).data[0].id,ids[0]);
  assert.equal((await users(actor,{...q,nameSort:'desc'},true)).data[0].id,ids[1]);
  assert.equal((await users(actor,{...q,companySort:'asc'},true)).data[0].id,ids[1]);
  assert.equal((await users(actor,{...q,companySort:'desc'},true)).data[0].id,ids[0]);
  assert.equal((await users(actor,q,true)).data[0].id,ids[2]);
  assert.equal((await users(actor,q,true)).pagination.total,3);
 }finally{await db.user.deleteMany({where:{id:{in:ids}}});await db.$disconnect();}
});

test('customer directory reports only currently usable credit in one batch', async () => {
 const suffix = randomUUID();
 const owner = await db.user.create({ data: { name: suffix, role: 'CUSTOMER', passwordHash: 'fixture' } });
 const actor = { id: randomUUID(), name: 'Admin', email: '', role: 'ADMIN' as const, departmentIds: [], sessionId: '' };
 let childId: string | undefined;
 try {
  const child = await db.user.create({ data: { name: suffix + ' child', role: 'CUSTOMER', parentCustomerId: owner.id, passwordHash: 'fixture' } }); childId = child.id;
  await db.agreement.createMany({ data: [
   { customerId: owner.id, name: 'Active', type: 'ONE_OFF', fee: '0', currency: 'TRY', credits: 100, usedCredits: 30, startsOn: new Date('2000-01-01'), endsOn: new Date('2099-01-01') },
   { customerId: owner.id, name: 'Expired', type: 'ONE_OFF', fee: '0', currency: 'TRY', credits: 100, startsOn: new Date('2000-01-01'), endsOn: new Date('2000-02-01') },
   { customerId: owner.id, name: 'Future', type: 'ONE_OFF', fee: '0', currency: 'TRY', credits: 100, startsOn: new Date('2099-01-01'), endsOn: new Date('2099-02-01') },
   { customerId: owner.id, name: 'Cancelled', type: 'ONE_OFF', fee: '0', currency: 'TRY', credits: 100, startsOn: new Date('2000-01-01'), endsOn: new Date('2099-01-01'), cancelledAt: new Date() },
  ] });
  const listed = await users(actor, directoryQuery.parse({ search: suffix }), true);
  assert.equal(listed.data.find(row => row.id === owner.id)?.availableCredits, 70);
  assert.equal(listed.data.find(row => row.id === child.id)?.availableCredits, 70);
  await db.user.update({ where: { id: owner.id }, data: { isActive: false } });
  assert.equal((await users(actor, directoryQuery.parse({ id: owner.id }), true)).data[0].availableCredits, 0);
 } finally {
  await db.agreement.deleteMany({ where: { customerId: owner.id } });
  if (childId) await db.user.delete({ where: { id: childId } });
  await db.user.delete({ where: { id: owner.id } });
 }
});
