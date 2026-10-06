import { EventEmitter } from 'node:events';
import type { Prisma } from '../generated/prisma/client.js';
import type { Actor } from '../types/express.js';
import { can } from './permissions.js';
export const events=new EventEmitter();
export function publishChange(conversationId?:string,internal=false){events.emit('change',{conversationId,internal});}
type Subject={id:string;customerId:string;assignedAgentId:string|null;departmentId:string;customer?:{name:string;email:string|null}};
export async function notifyConversation(tx:Prisma.TransactionClient,actor:Actor,conversation:Subject,type:string,title:string,internal=false){
  const candidates=await tx.user.findMany({where:{isActive:true,id:{not:actor.id},OR:[{role:'ADMIN'},{role:'SUPERVISOR',departments:{some:{departmentId:conversation.departmentId}}},{role:'AGENT',departments:{some:{departmentId:conversation.departmentId}}},...(conversation.assignedAgentId?[{id:conversation.assignedAgentId}]:[]),...(!internal?[{id:conversation.customerId}]:[])]},select:{id:true,role:true,accessRole:true,departments:{select:{departmentId:true}}}});
  const recipients=candidates.filter(user=>!user.accessRole || (can(user,'conversations.view') && (user.accessRole.scope==='ALL' || (user.accessRole.scope==='OWN' ? user.id===conversation.assignedAgentId : user.departments.some(d=>d.departmentId===conversation.departmentId)))));
  const person = conversation.customer ? `${conversation.customer.name}${conversation.customer.email ? ` · ${conversation.customer.email}` : ''}` : 'müşteri';
  const message = type === 'CREATED' ? `${person} tarafından yeni talep oluşturuldu.` : `${person} için görüşmede güncelleme yapıldı.`;
  const notificationRecipients = type === 'CREATED' && !recipients.some(u => u.id === actor.id) ? [...recipients, { id: actor.id }] : recipients;
  if(notificationRecipients.length)await tx.notification.createMany({data:notificationRecipients.map(u=>({userId:u.id,conversationId:conversation.id,type,title,message}))});
}
