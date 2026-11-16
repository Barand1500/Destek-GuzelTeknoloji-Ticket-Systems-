import 'dotenv/config';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {groupDuplicateCustomers,duplicateCustomers} from '../src/services/customer-merge.service.js';
import {db} from '../src/config/db.js';
import {randomUUID} from 'node:crypto';
const customer=(id:string,extra:Partial<{name:string;email:string|null;phone:string|null;company:string|null;extraEmails:string|null;extraPhones:string|null}>={})=>({id,name:'Yunus Durgun',email:null,phone:null,company:null,extraEmails:null,extraPhones:null,...extra});
test('duplicate name groups include all matching records and ignore whitespace, case and blanks',()=>{
 const rows=[customer('a'),customer('b',{name:' yunus   durgun '}),customer('c',{name:'YUNUS DURGUN'}),customer('d',{name:'Sercan'}),customer('e',{name:' '})];
 const groups=groupDuplicateCustomers(rows,'name','yunus');
 assert.equal(groups.length,1);assert.deepEqual(groups[0].customers.map(c=>c.id),['a','b','c']);
 assert.equal(groupDuplicateCustomers(rows,'name','olmayan').length,0);
});
test('phone and email matching includes alternate contacts and does not count the same customer twice',()=>{
 const rows=[customer('a',{phone:'0532 111 22 33',extraPhones:'+90 532 111 22 33',email:'test@example.com',extraEmails:'test@example.com'}),customer('b',{phone:'+90 532 111 22 33',extraEmails:'TEST@example.com'})];
 assert.equal(groupDuplicateCustomers(rows,'phone')[0].customers.length,2);
 assert.equal(groupDuplicateCustomers(rows,'phone','532111')[0].customers.length,2);
 assert.equal(groupDuplicateCustomers(rows,'email')[0].customers.length,2);
 assert.equal(groupDuplicateCustomers([rows[0]],'phone').length,0);
});
test('company matches are separate from names and empty values never form a group',()=>{
 const rows=[customer('a',{company:'Güzel Teknoloji'}),customer('b',{name:'Başka Kişi',company:' GÜZEL TEKNOLOJİ '}),customer('c'),customer('d')];
 assert.deepEqual(groupDuplicateCustomers(rows,'company')[0].customers.map(c=>c.id),['a','b']);
 assert.equal(groupDuplicateCustomers(rows,'email').length,0);
});

test('merge search excludes company contacts hidden from the main customer list',async()=>{
 const name='Merge roots '+randomUUID();
 const root=await db.user.create({data:{name,role:'CUSTOMER',passwordHash:'fixture'}});
 const second=await db.user.create({data:{name,role:'CUSTOMER',passwordHash:'fixture'}});
 const contact=await db.user.create({data:{name,role:'CUSTOMER',passwordHash:'fixture',parentCustomerId:root.id}});
 try{
  const groups=await duplicateCustomers({id:'staff',name:'Staff',role:'ADMIN',email:'',departmentIds:[],sessionId:''},{field:'name',search:name});
  assert.equal(groups.length,1);
  assert.deepEqual(new Set(groups[0].customers.map(c=>c.id)),new Set([root.id,second.id]));
 }finally{
  await db.user.update({where:{id:contact.id},data:{parentCustomerId:null}});
  await db.user.deleteMany({where:{id:{in:[root.id,second.id,contact.id]}}});
  await db.$disconnect();
 }
});
