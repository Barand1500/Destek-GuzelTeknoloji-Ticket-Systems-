import { Server } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import { allowedOrigins } from '../config/env.js';
import { resolveActor } from '../middleware/auth.js';
import { events } from '../services/events.service.js';
import { db } from '../config/db.js';
import { visibility } from '../services/conversations.service.js';
export function attachSockets(server:HttpServer){
  const io=new Server(server,{cors:{origin:(origin,done)=>done(null,!origin||allowedOrigins.has(origin)),credentials:true},maxHttpBufferSize:10000});
  io.use(async(socket,next)=>{try{await resolveActor(typeof socket.handshake.auth.token==='string'?socket.handshake.auth.token:undefined);next();}catch{next(new Error('UNAUTHENTICATED'));}});
  // No client-chosen rooms and no message payloads: REST rechecks current authorization.
  const refresh=async(change:{conversationId?:string;internal?:boolean})=>{
    for(const socket of io.sockets.sockets.values()){
      try{
        const actor=await resolveActor(socket.handshake.auth.token);
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
  const timer=setInterval(()=>{for(const socket of io.sockets.sockets.values())void resolveActor(socket.handshake.auth.token).catch(()=>socket.disconnect(true));},60000);timer.unref();
  server.on('close',()=>{clearInterval(timer);events.off('change',listener);});
  return io;
}
