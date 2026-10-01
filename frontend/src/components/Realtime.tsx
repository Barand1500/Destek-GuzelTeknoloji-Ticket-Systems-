import { useEffect,useRef } from 'react';
import { io } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { getToken,refreshAccess,setToken } from '../services/api';
import { useAuth } from '../features/auth/Auth';
import { useLocation } from 'react-router-dom';

function presencePage(pathname:string){
  if(/\/conversations\/[^/]+$/.test(pathname)||/\/tickets\/[^/]+$/.test(pathname))return 'Talep üzerinde çalışıyor';
  if(pathname.includes('/phone-support'))return 'Telefon desteği';
  if(pathname.includes('/customers'))return 'Müşteriler';
  if(pathname.includes('/inbox')||pathname.includes('/conversations'))return 'Gelen kutusu';
  if(pathname.includes('/dashboard'))return 'Genel bakış';
  if(pathname.includes('/staff-presence'))return 'Canlı takip';
  if(pathname.includes('/settings')||pathname.includes('/integrations'))return 'Ayarlar';
  return 'Uygulamada';
}
export function Realtime(){
  const {user}=useAuth();const client=useQueryClient();
  const {pathname}=useLocation();
  const emitPresenceRef=useRef<(()=>void)|null>(null);
  useEffect(()=>{
    if(!user)return;
    let active=true,renewing=false;let pending:ReturnType<typeof setTimeout>|undefined;
    const socket=io({auth:callback=>callback({token:getToken()}),transports:['websocket','polling']});
    let lastActivityAt=Date.now();let activityTimer:ReturnType<typeof setTimeout>|undefined;
    const emitPresence=()=>socket.connected&&socket.emit('presence:update',{path:window.location.pathname,page:presencePage(window.location.pathname),visible:document.visibilityState==='visible',lastActivityAt});
    emitPresenceRef.current=emitPresence;
    const activity=()=>{lastActivityAt=Date.now();clearTimeout(activityTimer);activityTimer=setTimeout(emitPresence,400);};
    const sync=()=>{if(!pending)pending=setTimeout(()=>{pending=undefined;void client.invalidateQueries();},75);};
    const renew=async()=>{if(renewing||!active)return;renewing=true;try{await refreshAccess();if(active)socket.connect();}catch{if(active){setToken(null);window.dispatchEvent(new Event('session-expired'));}}finally{renewing=false;}};
    socket.on('connect',()=>{sync();emitPresence();});
    for(const event of ['conversation:updated','conversation:message:new','notification:new','access:refresh'])socket.on(event,sync);
    socket.on('presence:changed',(change:{id:string;state:'ONLINE'|'IDLE'|'OFFLINE';page:string;path:string;lastActivityAt:string|null;lastSeenAt:string|null})=>{
      client.setQueryData<{idleMinutes:number;updatedAt:string;staff:Array<{id:string;state:string;page:string;path:string;lastActivityAt:string|null;lastSeenAt:string|null}>}>(['/staff-presence'],current=>{
        if(!current)return current;
        return {...current,updatedAt:new Date().toISOString(),staff:current.staff.map(person=>person.id===change.id?{...person,...change}:person)};
      });
    });
    socket.on('connect_error',error=>{if(error.message==='UNAUTHENTICATED')void renew();});
    socket.on('disconnect',reason=>{if(reason==='io server disconnect')void renew();});
    const changed=()=>{if(active&&getToken()){socket.disconnect();socket.connect();}};
    window.addEventListener('token-changed',changed);
    for(const event of ['pointerdown','keydown','scroll'] as const)window.addEventListener(event,activity,{passive:true});
    document.addEventListener('visibilitychange',activity);
    const presenceTimer=setInterval(emitPresence,30_000);
    const timer=setInterval(()=>void renew(),12*60*1000);
    return()=>{active=false;emitPresenceRef.current=null;clearInterval(timer);clearInterval(presenceTimer);clearTimeout(pending);clearTimeout(activityTimer);window.removeEventListener('token-changed',changed);for(const event of ['pointerdown','keydown','scroll'] as const)window.removeEventListener(event,activity);document.removeEventListener('visibilitychange',activity);socket.disconnect();};
  },[user?.id,client]);
  useEffect(()=>{emitPresenceRef.current?.();},[pathname]);
  return null;
}
