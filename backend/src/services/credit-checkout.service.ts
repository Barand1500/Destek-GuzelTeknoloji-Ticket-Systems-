import { paymentAvailability } from "./payment-settings.service.js";
import { akbankRecurringTerms } from './akbank-recurring-client.js';
import { createHmac, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { env } from '../config/env.js';
import { db } from '../config/db.js';
import type { Actor } from '../types/express.js';
import { AppError } from '../utils/errors.js';
import { creditStoreOwner } from './credit-store.service.js';
import { bankBrand } from './bank-brands.js';
import { TURKEY_BIN_RECORDS } from './turkey-bin-data.js';
import { BIN_ISSUER_OVERRIDES } from './bin-overrides.js';

export const cardInfoInput=z.object({bin:z.string().regex(/^\d{6,8}$/, 'Kart numarasının ilk 6–8 hanesini girin.')}).strict();
type BankInfo={available:boolean;bankName?:string;bankColor?:string;bankMark?:string;bankKey?:string;cardAssociation?:string;cardFamily?:string;cardType?:string;source?:'provider'|'local'|'public';reason?:string};

/** Offline issuer lookup from the bundled Turkish BIN list (first six digits). */
export function localCardInfo(bin:string):BankInfo|null {
 const record=BIN_ISSUER_OVERRIDES[bin.slice(0,6)]??TURKEY_BIN_RECORDS[bin.slice(0,6)];
 if(!record) return null;
 const brand=bankBrand(record.issuer);
 return {available:true,bankName:brand.name,bankColor:brand.color,bankMark:brand.mark,bankKey:brand.key,
  cardAssociation:record.network||undefined,cardFamily:record.category||undefined,cardType:record.type||undefined,source:'local'};
}
type BinConfig={apiKey:string;secretKey:string;mode:'sandbox'|'production'};
/** Sends only BIN, never PAN/expiry/CVC. Fixed provider destinations; no payment operation. */
export async function lookupCardBin(bin:string,config:BinConfig,fetcher:typeof fetch=fetch):Promise<BankInfo> {
 cardInfoInput.parse({bin});
 if(!config.apiKey || !config.secretKey) return {available:false,reason:'Banka bilgisi için ödeme sağlayıcısı bağlantısı gerekli.'};
 const path='/payment/bin/check', randomKey=randomBytes(16).toString('hex');
 const body=JSON.stringify({locale:'tr',binNumber:bin});
 const signature=createHmac('sha256',config.secretKey).update(randomKey+path+body).digest('hex');
 const authorization=Buffer.from(`apiKey:${config.apiKey}&randomKey:${randomKey}&signature:${signature}`).toString('base64');
 try {
  const response=await fetcher((config.mode==='production'?'https://api.iyzipay.com':'https://sandbox-api.iyzipay.com')+path, {method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:'IYZWSv2 '+authorization,'x-iyzi-rnd':randomKey},body,signal:AbortSignal.timeout(5000)});
  if(!response.ok) return {available:false,reason:'Banka bilgisi şu anda doğrulanamıyor.'};
  const value=await response.json();
  if(value?.status!=='success') return {available:false,reason:'Bu kart için banka bilgisi doğrulanamadı.'};
  const result=z.object({bankName:z.string().max(120).optional(),cardAssociation:z.string().max(40).optional(),cardFamily:z.string().max(80).optional(),cardType:z.string().max(40).optional()}).parse(value);
  return {available:true,...result};
 } catch {return {available:false,reason:'Banka bilgisi şu anda doğrulanamıyor.'};}
}
const cache=new Map<string,{expires:number;value:BankInfo}>();
/** Public fallback for cards missing from the bundled Turkish list; only the BIN is sent. */
async function lookupPublicCard(bin:string):Promise<BankInfo|null> {
 if(bin.length<6) return null;
 try {
  const response=await fetch(`https://lookup.binlist.net/${bin}`,{headers:{'Accept-Version':'3'},signal:AbortSignal.timeout(3500)});
  if(!response.ok) return null;
  const value=await response.json();
  const bankName=typeof value?.bank?.name==='string'?value.bank.name:'';
  if(!bankName) return null;
  const brand=bankBrand(bankName);
  return {available:true,bankName:brand.name,bankColor:brand.color,bankMark:brand.mark,bankKey:brand.key,
   cardAssociation:typeof value.scheme==='string'?value.scheme.toUpperCase():undefined,
   cardType:typeof value.type==='string'?value.type.toUpperCase():undefined,source:'public'};
 } catch { return null; }
}
export async function customerCardInfo(actor:Actor,raw:unknown) {
 await creditStoreOwner(actor);
 const {bin}=cardInfoInput.parse(raw);
 const config={apiKey:env.IYZICO_API_KEY,secretKey:env.IYZICO_SECRET_KEY,mode:env.IYZICO_BIN_MODE};
 // Public issuer data only; bounded memory. Never cache cardholder or card numbers.
 const key=config.mode+':'+bin;
 const existing=cache.get(key);
 if(existing && existing.expires>Date.now()) return existing.value;
 let value:BankInfo|undefined;
 if(bin.length===8 && config.apiKey && config.secretKey) {
  const provider=await lookupCardBin(bin,config);
  if(provider.available) {
   const brand=bankBrand(provider.bankName??'');
   value={...provider,bankName:provider.bankName?brand.name:undefined,bankColor:brand.color,bankMark:brand.mark,bankKey:brand.key,source:'provider'};
  }
 }
 // Provider is authoritative when configured; the bundled list keeps the screen useful offline.
 const local=localCardInfo(bin);
 if(local) value??=local;
 if(!value?.available) value=(await lookupPublicCard(bin))??value??{available:false,reason:'Bu kart aralığı için banka bilgisi bulunamadı.'};
 if(value.available) {if(cache.size>=500) cache.delete(cache.keys().next().value!);cache.set(key,{expires:Date.now()+15*60000,value});}
 return value;
}
export async function customerCheckout(actor:Actor,id:string) {
 const owner=await creditStoreOwner(actor);
 const row=await db.creditOrder.findFirst({where:{id,customerId:owner.id},select:{id:true,number:true,name:true,credits:true,total:true,currency:true,status:true,periodMonths:true,validityDays:true,periodName:true,periodStartsOn:true,periodEndsOn:true,renewalRequested:true,subscription:{select:{autoRenew:true}},customer:{select:{id:true,name:true,company:true,email:true,phone:true}}}});
 if(!row) throw new AppError(404,'ORDER_NOT_FOUND','Sipariş bulunamadı.');
 if(!['PENDING','FAILED'].includes(row.status)) throw new AppError(409,'ORDER_NOT_PENDING','Bu sipariş ödeme beklemiyor.');
 const {subscription,...data}=row;
 const availability = await paymentAvailability();
 const renewalRequested = Boolean(row.renewalRequested || subscription?.autoRenew);
 const recurringPayments = availability.provider === 'akbank' && availability.recurringAvailable && renewalRequested ? akbankRecurringTerms(row.periodMonths, row.validityDays).numberOfPayments : undefined;
 return {...data,renewalRequested,total:row.total.toString(),...availability,recurringPayments};
}
