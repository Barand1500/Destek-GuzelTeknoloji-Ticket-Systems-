import 'dotenv/config';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {conversationListOrder} from '../src/services/conversation-sorting.js';
import {listSchema} from '../src/validators/index.js';
test('inbox sorting supports one column and preserves stable default ordering',()=>{
 const fallback=[{updatedAt:'desc'},{id:'desc'}];
 assert.deepEqual(conversationListOrder(),fallback);
 for(const direction of ['asc','desc'] as const){
  assert.deepEqual(conversationListOrder('number',direction),[{number:direction},...fallback]);
  assert.deepEqual(conversationListOrder('subject',direction),[{subject:direction},...fallback]);
  assert.deepEqual(conversationListOrder('department',direction),[{department:{name:direction}},...fallback]);
  assert.deepEqual(conversationListOrder('assignedAgent',direction),[{assignedAgent:{name:direction}},...fallback]);
 }
 assert.equal(listSchema.safeParse({sortBy:'subject',sortDirection:'asc'}).success,true);
 assert.equal(listSchema.safeParse({sortBy:'number',sortDirection:'desc'}).success,true);
 assert.equal(listSchema.safeParse({sortBy:'invalid'}).success,false);
 assert.equal(listSchema.safeParse({sortDirection:'invalid'}).success,false);
});

test('response duration sorting spans pages and uses the latest unanswered message or completed response cycle', async () => {
 const {db} = await import('../src/config/db.js');
 const {listConversations} = await import('../src/services/conversations.service.js');
 const {randomUUID} = await import('node:crypto');
 const suffix=randomUUID();
 const department=await db.department.create({data:{name:`Sort ${suffix}`}});
 const customer=await db.user.create({data:{name:`Sort ${suffix}`,role:'CUSTOMER',passwordHash:'test'}});
 const ids:string[]=[];
 const now=Date.now();
 const at=(minutes:number)=>new Date(now-minutes*60000);
 const actor={id:customer.id,name:customer.name,email:'',role:'ADMIN' as const,departmentIds:[],sessionId:''};
 async function ticket(name:string,messages:[number,'CUSTOMER_MESSAGE'|'AGENT_REPLY'|'INTERNAL_NOTE'][],deleted=false){
  const row=await db.conversation.create({data:{subject:name,searchSubject:name,departmentId:department.id,customerId:customer.id,deletedAt:deleted?new Date():null, messages:{create:messages.map(([minutes,type])=>({authorId:customer.id,body:name,type,createdAt:at(minutes)}))}}});
  ids.push(row.id);return row.id;
 }
 try{
  const slow=await ticket('slow',[[120,'CUSTOMER_MESSAGE'],[60,'AGENT_REPLY']]);
  const fast=await ticket('fast',[[120,'CUSTOMER_MESSAGE'],[119,'AGENT_REPLY'],[1,'AGENT_REPLY']]);
  const old=await ticket('old',[[100,'CUSTOMER_MESSAGE'],[40,'CUSTOMER_MESSAGE'],[1,'INTERNAL_NOTE']]);
  const recent=await ticket('recent',[[10,'CUSTOMER_MESSAGE']]);
  const reopened=await ticket('reopened',[[200,'CUSTOMER_MESSAGE'],[199,'AGENT_REPLY'],[30,'CUSTOMER_MESSAGE']]);
  await ticket('deleted',[[10000,'CUSTOMER_MESSAGE']],true);
  for(const [direction,expected] of [['desc',[old,reopened,recent,slow,fast]],['asc',[fast,slow,recent,reopened,old]]] as const){
   const actual:string[]=[];
   for(let page=1;page<=3;page++){
    const result=await listConversations(actor,listSchema.parse({customerId:customer.id,sortBy:'responseTime',sortDirection:direction,page,limit:2,view:'all'}));
    assert.equal(result.pagination.total,5);
    actual.push(...result.data.map(row=>row.id));
    for(const row of result.data){
     if(row.id===slow)assert.equal(row.responseTimeAt!.getTime()-row.responseTimeStartAt!.getTime(),3600000);
     if(row.id===fast)assert.equal(row.responseTimeAt!.getTime()-row.responseTimeStartAt!.getTime(),60000);
     if([old,recent,reopened].includes(row.id))assert.equal(row.responseTimeAt,null);
    }
   }
   assert.deepEqual(actual,expected);
  }
  const empty=await listConversations(actor,listSchema.parse({customerId:customer.id,sortBy:'responseTime',page:99,limit:2}));
  assert.deepEqual(empty.data,[]);
 }finally{
  await db.conversationMessage.deleteMany({where:{conversationId:{in:ids}}});
  await db.conversation.deleteMany({where:{id:{in:ids}}});
  await db.user.delete({where:{id:customer.id}});
  await db.department.delete({where:{id:department.id}});
  await db.$disconnect();
 }
});
