import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
process.env.NODE_ENV='test';
const {db}=await import('../src/config/db.js');
const {departmentAgents}=await import('../src/services/management.service.js');
const {createConversation,updateConversation,listConversations}=await import('../src/services/conversations.service.js');
test('agents and managers can assign active department managers',async()=>{
 const suffix=randomUUID();const users:string[]=[];const departments:string[]=[];const conversations:string[]=[];
 try {
 const d=await db.department.create({data:{name:`Manager assignment ${suffix}`}});departments.push(d.id);
 const outside=await db.department.create({data:{name:`Outside manager ${suffix}`}});departments.push(outside.id);
 async function user(role:'ADMIN'|'AGENT'|'CUSTOMER',departmentId?:string){const u=await db.user.create({data:{name:'Assignment test',email:`${randomUUID()}@example.test`,passwordHash:'test-only',role,...(departmentId?{departments:{create:{departmentId}}}:{})}});users.push(u.id);return u;}
 const customer=await user('CUSTOMER');const agent=await user('AGENT',d.id);const manager=await user('ADMIN',d.id);const other=await user('ADMIN',d.id);const foreign=await user('ADMIN',outside.id);
 const actor=(u:typeof agent)=>({id:u.id,name:u.name,email:u.email!,role:u.role,sessionId:'test',departmentIds:[d.id],rolePermissions:['conversations.assign','conversations.view','conversations.create','conversations.update','conversations.reply'],roleScope:'DEPARTMENT'});
 const list=await departmentAgents(actor(agent),d.id,{page:1,limit:100});
 assert.ok(list.data.some(u=>u.id===manager.id));assert.ok(!list.data.some(u=>u.id===foreign.id));
 const c=await createConversation(actor(agent),{customerId:customer.id,departmentId:d.id,assignedAgentId:agent.id,channel:'TICKET',subject:'Manager assignment test',message:'Test request',priority:'NORMAL'});conversations.push(c.id);
 await updateConversation(actor(agent),c.id,{assignedAgentId:manager.id});
 assert.equal((await db.conversation.findUniqueOrThrow({where:{id:c.id}})).assignedAgentId,manager.id);
 await updateConversation(actor(manager),c.id,{assignedAgentId:other.id});
 assert.equal((await db.conversation.findUniqueOrThrow({where:{id:c.id}})).assignedAgentId,other.id);
 await assert.rejects(updateConversation(actor(manager),c.id,{assignedAgentId:foreign.id}),/departmanda/);
 await updateConversation(actor(manager),c.id,{replyChannels:['TICKET']});
 assert.deepEqual((await db.conversation.findUniqueOrThrow({where:{id:c.id}})).replyChannels,['TICKET']);
 const email=await db.conversation.create({data:{customerId:customer.id,departmentId:d.id,channel:'EMAIL',source:'PHONE_SUPPORT',subject:'Outgoing email filter test',searchSubject:'outgoing email filter test'}});conversations.push(email.id);
 const phoneList=await listConversations(actor(manager),{page:1,limit:100,view:'all',category:'TICKET'});
 assert.ok(phoneList.data.some(item=>item.id===c.id));
 assert.ok(!phoneList.data.some(item=>item.id===email.id));
 const mailList=await listConversations(actor(manager),{page:1,limit:100,view:'all',category:'EMAIL'});
 assert.ok(mailList.data.some(item=>item.id===email.id));
 assert.ok(!mailList.data.some(item=>item.id===c.id));
 const alpha=await db.conversation.create({data:{customerId:customer.id,departmentId:d.id,channel:'TICKET',subject:'Alpha',searchSubject:'alpha',updatedAt:new Date('2030-01-01T00:00:00Z')}});conversations.push(alpha.id);
 const zulu=await db.conversation.create({data:{customerId:customer.id,departmentId:d.id,channel:'TICKET',subject:'Zulu',searchSubject:'zulu'}});conversations.push(zulu.id);
 const ascending=await listConversations(actor(manager),{page:1,limit:1,view:'all',departmentId:d.id,sortBy:'subject',sortDirection:'asc'});
 assert.equal(ascending.data[0].id,alpha.id,'Sorting must happen before pagination');
 const descending=await listConversations(actor(manager),{page:1,limit:1,view:'all',departmentId:d.id,sortBy:'subject',sortDirection:'desc'});
 assert.equal(descending.data[0].id,zulu.id);
 const defaults=await listConversations(actor(manager),{page:1,limit:1,view:'all',departmentId:d.id});
 assert.equal(defaults.data[0].id,alpha.id,'Default ordering remains latest update first');
 } finally {
 await db.activityLog.deleteMany({where:{userId:{in:users}}});
 await db.conversationMessage.deleteMany({where:{conversationId:{in:conversations}}});
 await db.conversation.deleteMany({where:{id:{in:conversations}}});
 await db.user.deleteMany({where:{id:{in:users}}});
 await db.department.deleteMany({where:{id:{in:departments}}});
 await db.$disconnect();
 }
});
