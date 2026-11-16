import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomInt} from 'node:crypto';
import {db} from '../src/config/db.js';
import {createCustomer,updateCustomer} from '../src/services/management.service.js';
import {createRelatedCustomer} from '../src/services/agreements.service.js';
import type {Actor} from '../src/types/express.js';
after(async()=>{await db.$disconnect();});
test('customer email and phone each independently prevent duplicates on create and edit',async()=>{
 const suffix=randomUUID(),phone='05'+String(randomInt(100000000,999999999));
 const staff=await db.user.create({data:{name:'Contact uniqueness staff '+suffix,role:'ADMIN',passwordHash:'test'}});
 const first=await db.user.create({data:{name:'Contact first '+suffix,role:'CUSTOMER',email:'unique-'+suffix+'@example.invalid',phone:phone.slice(0,4)+' '+phone.slice(4,7)+' '+phone.slice(7,9)+' '+phone.slice(9),passwordHash:'test'}});
 const second=await db.user.create({data:{name:'Contact second '+suffix,role:'CUSTOMER',email:'other-'+suffix+'@example.invalid',phone:null,passwordHash:'test',parentCustomerId:first.id}});
 const actor:Actor={id:staff.id,name:staff.name,role:'ADMIN',email:'',departmentIds:[],sessionId:''};
 const input={name:'Different name '+suffix,company:'Different company',email:first.email!,phone:'05'+String(randomInt(100000000,999999999))};
 const originalTx=db.$transaction.bind(db);
 db.$transaction=((work:any,opts?:any)=>originalTx(async tx=>{
  const upsert=tx.outboundMessage.upsert.bind(tx.outboundMessage);
  tx.outboundMessage.upsert=((args:any)=>upsert({...args,create:{...args.create,availableAt:new Date('2099-01-01')}})) as typeof upsert;
  return work(tx);
 },opts)) as typeof db.$transaction;
 try{
  await assert.rejects(createCustomer(actor,input),(error:any)=>error.code==='CUSTOMER_EMAIL_EXISTS');
  await assert.rejects(createCustomer(actor,{...input,email:'new-'+suffix+'@example.invalid',phone:'+90'+phone.slice(1)}),(error:any)=>error.code==='CUSTOMER_PHONE_EXISTS');
  await assert.rejects(updateCustomer(actor,second.id,{email:first.email!.toUpperCase()}),(error:any)=>error.code==='CUSTOMER_EMAIL_EXISTS');
  await assert.rejects(updateCustomer(actor,second.id,{phone:phone.slice(1)}),(error:any)=>error.code==='CUSTOMER_PHONE_EXISTS');
  await assert.rejects(createRelatedCustomer(actor,first.id,{direction:'CHILD',customer:input}),(error:any)=>error.code==='CUSTOMER_EMAIL_EXISTS');
  await updateCustomer(actor,first.id,{email:first.email!,phone});
  await db.user.update({where:{id:first.id},data:{isActive:false}});
  await assert.rejects(createCustomer(actor,input),(error:any)=>error.code==='CUSTOMER_EMAIL_EXISTS');
  await updateCustomer(actor,second.id,{name:'Changed name'});
  assert.equal((await db.user.findUniqueOrThrow({where:{id:second.id}})).email,second.email);
  const raceEmail='race-'+suffix+'@example.invalid';
  const attempts=await Promise.allSettled([0,1].map(i=>createCustomer(actor,{...input,name:'Race '+suffix+' '+i,email:raceEmail,phone:'05'+String(randomInt(100000000,999999999))})));
  assert.equal(attempts.filter(result=>result.status==='fulfilled').length,1);
  const rejected=attempts.find(result=>result.status==='rejected') as PromiseRejectedResult;
  assert.equal(rejected.reason.code,'CUSTOMER_EMAIL_EXISTS');
  assert.equal(await db.user.count({where:{role:'CUSTOMER',email:raceEmail,deletedAt:null}}),1);
 }finally{
  db.$transaction=originalTx;
  const extra=await db.user.findMany({where:{OR:[{name:'Different name '+suffix},{name:{startsWith:'Race '+suffix}}]},select:{id:true}});
  const extraIds=extra.map(x=>x.id);
  await db.outboundMessage.deleteMany({where:{userId:{in:extraIds}}});
  await db.notification.deleteMany({where:{type:'CUSTOMER_CREATED',message:{contains:suffix}}});
  await db.user.deleteMany({where:{id:{in:extraIds}}});
  await db.activityLog.deleteMany({where:{userId:staff.id}});
  await db.user.update({where:{id:second.id},data:{parentCustomerId:null}});
  await db.user.deleteMany({where:{id:{in:[staff.id,first.id,second.id]}}});
 }
});
