import { Server } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import { allowedOrigins } from '../config/env.js';
import { resolveActor } from '../middleware/auth.js';
import { events } from '../services/events.service.js';
import { db } from '../config/db.js';
import { visibility } from '../services/conversations.service.js';
import { canReceiveStaffPresence, connectPresence, disconnectPresence, presenceEvents, updatePresence, type PresenceChanged } from '../services/presence.service.js';
export function attachSockets(server:HttpServer){
  const io=new Server(server,{cors:{origin:(origin,done)=>done(null,!origin||allowedOrigins.has(origin)),credentials:true},maxHttpBufferSize:10000});
  io.use(async(socket,next)=>{try{await resolveActor(typeof socket.handshake.auth.token==='string'?socket.handshake.auth.token:undefined);next();}catch{next(new Error('UNAUTHENTICATED'));}});
  io.on('connection',async socket=>{
    try{
      const actor=await resolveActor(socket.handshake.auth.token);
      await connectPresence(actor.id,socket.id);
      socket.on('presence:update',(input:unknown)=>{
        if(!input||typeof input!=='object')return;
        const value=input as Record<string,unknown>;
        if(typeof value.path!=='string'||typeof value.page!=='string'||typeof value.visible!=='boolean'||typeof value.lastActivityAt!=='number'||!Number.isFinite(value.lastActivityAt))return;
        updatePresence(actor.id,socket.id,{path:value.path,page:value.page,visible:value.visible,lastActivityAt:value.lastActivityAt});
      });
      socket.on('disconnect',()=>disconnectPresence(actor.id,socket.id));
    }catch{socket.disconnect(true);}
  });
  // No client-chosen rooms and no message payloads: REST rechecks current authorization.
  const refresh=async(change:{conversationId?:string;internal?:boolean})=>{
    for(const socket of io.sockets.sockets.values()){
      try{
        const actor=await resolveActor(socket.handshake.auth.token);
        if(!change.conversationId)socket.emit('access:refresh');
        if(change.internal&&actor.role==='CUSTOMER')continue;
        if(change.conversationId){
          const visible=await db.conversation.count({where:{AND:[visibility(actor),{id:change.conversationId}]}});
          if(!visible){if(actor.role!=='CUSTOMER')socket.emit('access:refresh');continue;}
        }
        socket.emit('conversation:updated');socket.emit('conversation:message:new');socket.emit('notification:new');
      }catch{socket.disconnect(true);}
    }
  };
  const listener=(change:{conversationId?:string;internal?:boolean})=>{void refresh(change).catch(()=>{});};
  events.on('change',listener);
  const sendPresence=async(change:PresenceChanged)=>{
    const person=await db.user.findFirst({where:{id:change.id,isActive:true,deletedAt:null,role:{in:['ADMIN','SUPERVISOR','AGENT']}},select:{id:true,departments:{select:{departmentId:true}}}});
    if(!person)return;
    const subject={id:person.id,departmentIds:person.departments.map(item=>item.departmentId)};
    await Promise.all([...io.sockets.sockets.values()].map(async socket=>{
      try{
        const actor=await resolveActor(socket.handshake.auth.token);
        if(canReceiveStaffPresence(actor,subject))socket.emit('presence:changed',change);
      }catch{socket.disconnect(true);}
    }));
  };
  const presenceListener=(change:PresenceChanged)=>{void sendPresence(change).catch(()=>{});};
  presenceEvents.on('changed',presenceListener);
  const timer=setInterval(()=>{for(const socket of io.sockets.sockets.values())void resolveActor(socket.handshake.auth.token).catch(()=>socket.disconnect(true));},60000);timer.unref();
  server.on('close',()=>{clearInterval(timer);events.off('change',listener);presenceEvents.off('changed',presenceListener);});
  return io;
}
