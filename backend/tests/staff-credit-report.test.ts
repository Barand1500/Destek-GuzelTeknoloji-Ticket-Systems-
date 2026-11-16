import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {db} from '../src/config/db.js';
import {staffCreditReport,creditReportPeriod} from '../src/services/staff-credit-report.service.js';
import type {Actor} from '../src/types/express.js';
after(async()=>{await db.$disconnect();});
test('credit report periods start at Istanbul midnight, including early morning records',()=>{
 const period=creditReportPeriod(7,new Date('2026-11-15T22:30:00Z'));
 assert.equal(period.from.toISOString(),'2026-11-09T21:00:00.000Z');
 assert.equal(creditReportPeriod(30,new Date('2026-11-16T12:00:00Z')).from.toISOString(),'2026-10-17T21:00:00.000Z');
});
test('credit reports attribute charges to actual actor with date, scope and pagination filters',async()=>{
 const suffix=randomUUID();
 const people=await Promise.all(['ADMIN','AGENT','AGENT','CUSTOMER'].map((role,i)=>db.user.create({data:{name:'Credit report '+suffix+' '+i,role:role as 'ADMIN'|'AGENT'|'CUSTOMER',passwordHash:'fixture'}})));
 const [admin,charger,assignee,customer]=people;
 const departments=await Promise.all([0,1].map(i=>db.department.create({data:{name:'Credit report '+suffix+' '+i}})));
 const actor:Actor={id:admin.id,name:admin.name,role:'ADMIN',email:'',departmentIds:[],sessionId:''};
 const tickets=[];
 for(let i=0;i<3;i++) tickets.push(await db.conversation.create({data:{subject:'Charged ticket '+i,searchSubject:'charged ticket',customerId:customer.id,assignedAgentId:assignee.id,departmentId:departments[i===2?1:0].id,channel:'TICKET',createdAt:new Date('2020-01-01')}}));
 const agreement=await db.agreement.create({data:{customerId:customer.id,name:'Report package',type:'ONE_OFF',startsOn:new Date('2020-01-01'),endsOn:new Date('2099-01-01'),credits:100,usedCredits:20,fee:0}});
 try{
  await db.creditCharge.createMany({data:tickets.map((ticket,i)=>({conversationId:ticket.id,agreementId:agreement.id,actorId:charger.id,credits:i===0?20:0,createdAt:i===1?new Date('2020-01-01'):new Date()}))});
  const q={page:1,limit:1,days:30,agentId:charger.id};
  const result=await staffCreditReport(actor,q);
  assert.equal(result.totalCredits,20);assert.equal(result.pagination.total,2);assert.equal(result.data.length,1);
  assert.equal(result.staff.find(s=>s.id===charger.id)?.credits,20);
  assert.equal(result.data[0].actor.id,charger.id);
  assert.equal((await staffCreditReport(actor,{...q,agentId:assignee.id})).pagination.total,0);
  assert.equal((await staffCreditReport(actor,{...q,departmentId:departments[0].id})).pagination.total,1);
  assert.equal((await staffCreditReport(actor,{...q,search:'Charged ticket 0'})).pagination.total,1);
  assert.equal((await staffCreditReport(actor,{...q,search:charger.name})).pagination.total,2);
  assert.equal((await staffCreditReport(actor,{...q,search:customer.name})).pagination.total,2);
  assert.equal((await staffCreditReport(actor,{...q,search:'#TK-'+tickets[0].number})).pagination.total,1);
  assert.equal((await staffCreditReport(actor,{...q,search:'Report package'})).pagination.total,2);
  assert.equal((await staffCreditReport(actor,{...q,search:'no-such-record-'+suffix})).pagination.total,0);
  const paid=await staffCreditReport(actor,{...q,creditType:'paid'});
  assert.equal(paid.pagination.total,1);assert.equal(paid.totalCredits,20);
  const free=await staffCreditReport(actor,{...q,creditType:'free'});
  assert.equal(free.pagination.total,1);assert.equal(free.totalCredits,0);
  assert.equal((await staffCreditReport(actor,{...q,page:3})).staff.length,0);
  const own={...actor,id:assignee.id,role:'AGENT' as const,roleScope:'OWN' as const,rolePermissions:['reports.view']};
  assert.equal((await staffCreditReport(own,{...q,agentId:charger.id})).pagination.total,0);
  const scoped={...actor,role:'SUPERVISOR' as const,departmentIds:[departments[0].id],roleScope:'DEPARTMENT' as const,rolePermissions:['reports.view']};
  assert.equal((await staffCreditReport(scoped,q)).pagination.total,1);
  await assert.rejects(staffCreditReport({...actor,role:'CUSTOMER'},q));
  await assert.rejects(staffCreditReport({...own,rolePermissions:[]},q));
 }finally{
  await db.creditCharge.deleteMany({where:{conversationId:{in:tickets.map(t=>t.id)}}});
  await db.agreement.delete({where:{id:agreement.id}});
  await db.conversation.deleteMany({where:{id:{in:tickets.map(t=>t.id)}}});
  await db.user.deleteMany({where:{id:{in:people.map(p=>p.id)}}});
  await db.department.deleteMany({where:{id:{in:departments.map(d=>d.id)}}});
 }
});
