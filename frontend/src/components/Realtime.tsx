import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { getToken,refreshAccess,setToken } from '../services/api';
import { useAuth } from '../features/auth/Auth';
export function Realtime(){
  const {user}=useAuth();const client=useQueryClient();
  useEffect(()=>{
    if(!user)return;
    let active=true,renewing=false;let pending:ReturnType<typeof setTimeout>|undefined;
    const socket=io({auth:callback=>callback({token:getToken()}),transports:['websocket','polling']});
    const sync=()=>{if(!pending)pending=setTimeout(()=>{pending=undefined;void client.invalidateQueries();},75);};
    const renew=async()=>{if(renewing||!active)return;renewing=true;try{await refreshAccess();if(active)socket.connect();}catch{if(active){setToken(null);window.dispatchEvent(new Event('session-expired'));}}finally{renewing=false;}};
    socket.on('connect',sync);
    for(const event of ['conversation:updated','conversation:message:new','notification:new','access:refresh'])socket.on(event,sync);
    socket.on('connect_error',error=>{if(error.message==='UNAUTHENTICATED')void renew();});
    socket.on('disconnect',reason=>{if(reason==='io server disconnect')void renew();});
    const changed=()=>{if(active&&getToken()){socket.disconnect();socket.connect();}};
    window.addEventListener('token-changed',changed);
    const timer=setInterval(()=>void renew(),12*60*1000);
    return()=>{active=false;clearInterval(timer);clearTimeout(pending);window.removeEventListener('token-changed',changed);socket.disconnect();};
  },[user?.id,client]);
  return null;
}
