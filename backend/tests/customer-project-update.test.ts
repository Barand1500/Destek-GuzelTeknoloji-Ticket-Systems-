import {test, after} from 'node:test';
after(async()=>{await db.$disconnect();});
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {db} from '../src/config/db.js';
import {updateConversation} from '../src/services/conversations.service.js';
import type {Actor} from '../src/types/express.js';

test('customers can change only their own open ticket project', async()=>{
 const suffix=randomUUID();
 const customer=await db.user.create({data:{name:'Project fixture '+suffix,role:'CUSTOMER',passwordHash:'fixture'}});
 const other=await db.user.create({data:{name:'Other fixture '+suffix,role:'CUSTOMER',passwordHash:'fixture',parentCustomerId:customer.id}});
 const department=await db.department.create({data:{name:'Project fixture '+suffix}});
 const project=await db.website.create({data:{name:'Project fixture '+suffix,url:'https://'+suffix+'.example.test'}});
 const tickets=await Promise.all([customer,other].map(user=>db.conversation.create({data:{customerId:user.id,departmentId:department.id,subject:'Project fixture',searchSubject:'project fixture',channel:'TICKET'}})));
 const actor:Actor={id:customer.id,name:customer.name,email:'',role:'CUSTOMER',departmentIds:[],sessionId:''};
 try {
  const updated=await updateConversation(actor,tickets[0].id,{websiteId:project.id});
  assert.equal(updated.websiteId,project.id);
  assert.equal(updated.websiteUrl,project.url);
  assert.equal(await db.activityLog.count({where:{entityId:tickets[0].id,action:'conversation.updated',userId:customer.id}}),1);
  assert.equal(await db.conversationMessage.count({where:{conversationId:tickets[0].id,type:'SYSTEM'}}),1);
  await assert.rejects(updateConversation(actor,tickets[1].id,{websiteId:project.id}));
  await assert.rejects(updateConversation(actor,tickets[0].id,{websiteId:project.id,departmentId:department.id}));
  await db.website.update({where:{id:project.id},data:{isActive:false}});
  await assert.rejects(updateConversation(actor,tickets[0].id,{websiteId:project.id}));
  await updateConversation(actor,tickets[0].id,{websiteId:null});
  for(const status of ['RESOLVED','CLOSED']){
   await db.conversation.update({where:{id:tickets[0].id},data:{status}});
   await assert.rejects(updateConversation(actor,tickets[0].id,{websiteId:null}));
  }
 } finally {
  await db.notification.deleteMany({where:{conversationId:{in:tickets.map(t=>t.id)}}});
  await db.activityLog.deleteMany({where:{entityId:{in:tickets.map(t=>t.id)}}});
  await db.conversationMessage.deleteMany({where:{conversationId:{in:tickets.map(t=>t.id)}}});
  await db.conversation.deleteMany({where:{id:{in:tickets.map(t=>t.id)}}});
  await db.website.delete({where:{id:project.id}});
  await db.user.updateMany({where:{id:{in:[customer.id,other.id]}},data:{parentCustomerId:null}});
  await db.user.deleteMany({where:{id:{in:[customer.id,other.id]}}});
  await db.department.delete({where:{id:department.id}});
 }
});
