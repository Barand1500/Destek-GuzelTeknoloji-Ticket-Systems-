import { randomUUID } from 'node:crypto';
import { mkdir,writeFile,unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileTypeFromBuffer } from 'file-type';
import multer from 'multer';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
export const uploadRoot=path.resolve(env.UPLOAD_DIR);
export const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:env.MAX_FILE_SIZE,files:5,fields:10,parts:15,fieldSize:20000}}).array('files',5);
export type StoredUpload={originalName:string;mimeType:string;size:number;storageKey:string};
const mimeByExtension:Record<string,string>={'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.pdf':'application/pdf','.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','.txt':'text/plain','.zip':'application/zip'};
export async function validateFile(file:Express.Multer.File):Promise<Omit<StoredUpload,'storageKey'>>{
  const originalName=path.basename(file.originalname.replaceAll('\\','/')).replace(/[\u0000-\u001f\u007f]/g,'').slice(-180);
  const mime=mimeByExtension[path.extname(originalName).toLowerCase()];
  if(!mime||!file.size||file.size>env.MAX_FILE_SIZE)throw new AppError(400,'INVALID_FILE','Dosya türü veya boyutu desteklenmiyor.');
  if(file.mimetype!==mime&&file.mimetype!=='application/octet-stream')throw new AppError(400,'INVALID_FILE','Dosyanın MIME türü uzantısıyla uyuşmuyor.');
  let actual:string|undefined;
  if(mime==='text/plain'){
    try{const text=new TextDecoder('utf-8',{fatal:true}).decode(file.buffer);if(text.includes('\0'))throw new Error();actual='text/plain';}catch{throw new AppError(400,'INVALID_FILE','Metin dosyası geçerli UTF-8 olmalıdır.');}
  }else{try{actual=(await fileTypeFromBuffer(file.buffer))?.mime;}catch{actual=undefined;}}
  if(actual!==mime)throw new AppError(400,'INVALID_FILE','Dosya içeriği belirtilen dosya türüyle uyuşmuyor.');
  return {originalName,mimeType:mime,size:file.size};
}
export async function withStoredUploads<T>(files:Express.Multer.File[]|undefined,work:(stored:StoredUpload[])=>Promise<T>):Promise<T>{
  const items=files??[];
  const metadata=await Promise.all(items.map(validateFile));
  const stored:StoredUpload[]=[];
  try{
    if(items.length)await mkdir(uploadRoot,{recursive:true});
    for(let i=0;i<items.length;i++){
      const storageKey=randomUUID();
      await writeFile(path.join(uploadRoot,storageKey),items[i].buffer,{flag:'wx',mode:0o600});
      stored.push({...metadata[i],storageKey});
    }
    return await work(stored);
  }catch(error){await Promise.allSettled(stored.map(file=>unlink(path.join(uploadRoot,file.storageKey))));throw error;}
}
