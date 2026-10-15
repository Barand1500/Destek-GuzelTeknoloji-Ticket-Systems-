import 'dotenv/config';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {db} from '../src/config/db.js';
import {users} from '../src/services/management.service.js';
import {customerListOrder} from '../src/services/customer-sorting.js';
import {directoryQuery} from '../src/validators/management.js';
test('customer name sorting retains newest-created default ordering',()=>{
 assert.deepEqual(customerListOrder(),[{createdAt:'desc'},{id:'desc'}]);
 assert.deepEqual(customerListOrder('asc'),[{name:'asc'},{createdAt:'desc'},{id:'desc'}]);
 assert.deepEqual(customerListOrder('desc'),[{name:'desc'},{createdAt:'desc'},{id:'desc'}]);
 assert.equal(directoryQuery.safeParse({nameSort:'invalid'}).success,false);
});
test('customer ordering applies before pagination and keeps the search filter',async()=>{
 const suffix=randomUUID();const ids:string[]=[];
 const actor={id:randomUUID(),name:'Test admin',email:'',role:'ADMIN' as const,departmentIds:[],sessionId:'test'};
 try{
  for(const [name,year] of [['Alpha',2020],['Zulu',2021],['Middle',2022]] as const){
   const customer=await db.user.create({data:{name:`${name} ${suffix}`,role:'CUSTOMER',passwordHash:'test-only',createdAt:new Date(`${year}-01-01T00:00:00Z`)}});ids.push(customer.id);
  }
  const q={page:1,limit:1,search:suffix};
  assert.equal((await users(actor,{...q,nameSort:'asc'},true)).data[0].id,ids[0]);
  assert.equal((await users(actor,{...q,nameSort:'desc'},true)).data[0].id,ids[1]);
  assert.equal((await users(actor,q,true)).data[0].id,ids[2]);
  assert.equal((await users(actor,q,true)).pagination.total,3);
 }finally{await db.user.deleteMany({where:{id:{in:ids}}});await db.$disconnect();}
});
