import { createServer } from 'node:net';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
dotenv.config({path:path.join(root,'backend/.env'),quiet:true});
const instance=createHash('sha256').update(root.toLowerCase()).digest('hex').slice(0,16);
const apiPort=Number(process.env.PORT??3000);
async function free(port){return new Promise(resolve=>{const s=createServer();s.once('error',()=>resolve(false));s.listen(port,'127.0.0.1',()=>s.close(()=>resolve(true)));});}
async function owned(url){try{const r=await fetch(url,{signal:AbortSignal.timeout(2500)});const body=await r.json();return body.instance===instance||(!body.instance&&body.success===true&&body.data?.status==='ok');}catch{return false;}}
let databaseClient;
try{databaseClient=await mysql.createConnection(process.env.DATABASE_URL);await databaseClient.query('SELECT 1');}catch{console.error('MySQL veritabanına bağlanılamadı. backend/.env ayarlarını ve MySQL durumunu kontrol edin. Sunucular başlatılmadı.');process.exitCode=1;}finally{await databaseClient?.end().catch(()=>{});}
if(process.exitCode)process.exit(process.exitCode);
const apiFree=await free(apiPort),webFree=await free(5173);
const apiOwn=!apiFree&&await owned(`http://127.0.0.1:${apiPort}/api/health`);
const webOwn=!webFree&&await owned('http://127.0.0.1:5173/__helpdesk_dev');
if((!apiFree&&!apiOwn)||(!webFree&&!webOwn)){
  console.error(`Başlatılamadı: ${!webFree&&!webOwn?'5173':apiPort} portunda başka veya eski bir süreç çalışıyor. O terminalde Ctrl+C ile kapatın ve npm run dev komutunu tekrar çalıştırın. Hiçbir süreç otomatik kapatılmadı.`);
  process.exit(1);
}
if(apiOwn&&webOwn){console.log('Destek zaten çalışıyor: http://localhost:5173 — ikinci bir sunucu başlatılmadı.');process.exit(0);}
const commands=[];
if(apiFree)commands.push('npm run dev -w backend');
if(webFree)commands.push('npm run dev -w frontend');
console.log('Destek: http://localhost:5173 (durdurmak için Ctrl+C)');
const child=spawn(process.execPath,[path.join(root,'node_modules/concurrently/dist/bin/concurrently.js'),'--kill-others',...commands],{cwd:root,stdio:'inherit',env:process.env,windowsHide:true,detached:process.platform!=='win32'});
let stopping=false;
function stop(signal){
  if(stopping)return;
  stopping=true;
  const exitCode=signal==='SIGINT'?130:143;
  if(!child.pid){process.exitCode=exitCode;return;}
  if(process.platform==='win32'){
    // Node cannot forward POSIX signals to a Windows npm/cmd process tree.
    // Target only the concurrently child created above, never reused servers.
    const cleanup=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});
    cleanup.once('error',error=>{console.error(`Sunucu süreçleri kapatılamadı: ${error.message}`);process.exitCode=1;});
    cleanup.once('exit',code=>{if(code!==0&&child.exitCode===null)console.error('Sunucu süreçleri kapatılamadı. Bu terminalde çalışan süreçleri kontrol edin.');process.exitCode=code===0?exitCode:1;});
  }else{
    try{process.kill(-child.pid,signal);}catch(error){if(error.code!=='ESRCH')throw error;}
    const timeout=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch(error){if(error.code!=='ESRCH')console.error(error.message);}},5000);
    timeout.unref();
    process.exitCode=exitCode;
  }
}
child.once('error',error=>{console.error(`Sunucular başlatılamadı: ${error.message}`);process.exitCode=1;});
child.once('exit',(code,signal)=>{if(!stopping)process.exitCode=code??(signal?1:0);});
process.on('SIGINT',()=>stop('SIGINT'));
process.on('SIGTERM',()=>stop('SIGTERM'));
