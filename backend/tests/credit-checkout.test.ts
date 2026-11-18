import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { db } from '../src/config/db.js';
import { cardInfoInput,customerCheckout,customerCardInfo,lookupCardBin,localCardInfo } from '../src/services/credit-checkout.service.js';
const owner={id:'owner',name:'Owner',email:'',role:'CUSTOMER' as const,departmentIds:[],sessionId:''};
test('BIN lookup sends exactly 8 digits to a fixed provider, signs exact body and never initiates payment',async()=>{
 assert.equal(cardInfoInput.safeParse({bin:'1234567812345678'}).success,false);
 assert.equal(cardInfoInput.safeParse({bin:'12345678',cvc:'123'}).success,false);
 let calls=0;
 const fetcher=(async(url:any,init:any)=>{
  calls++;assert.equal(url,'https://sandbox-api.iyzipay.com/payment/bin/check');
  assert.deepEqual(JSON.parse(init.body),{locale:'tr',binNumber:'41579200'});
  assert.equal(init.redirect,'error');
  const auth=Buffer.from(init.headers.Authorization.replace('IYZWSv2 ',''),'base64').toString();
  const expected=createHmac('sha256','secret').update(init.headers['x-iyzi-rnd']+'/payment/bin/check'+init.body).digest('hex');
  assert.equal(auth,`apiKey:key&randomKey:${init.headers['x-iyzi-rnd']}&signature:${expected}`);
  return Response.json({status:'success',bankName:'Fixture Bank',cardAssociation:'VISA',secret:'never returned'});
 }) as typeof fetch;
 const result=await lookupCardBin('41579200',{apiKey:'key',secretKey:'secret',mode:'sandbox'},fetcher);
 assert.deepEqual(result,{available:true,bankName:'Fixture Bank',cardAssociation:'VISA'});
 assert.equal(calls,1);
 assert.equal((await lookupCardBin('41579200',{apiKey:'',secretKey:'',mode:'sandbox'},fetcher)).available,false);
 assert.equal(calls,1);
 assert.equal((await lookupCardBin('41579200',{apiKey:'key',secretKey:'secret',mode:'sandbox'},async()=>{throw new Error('secret');})).available,false);
});
test('bundled Turkish BIN list identifies the issuer without a provider call',()=>{
 const garanti=localCardInfo('52695500');
 assert.equal(garanti?.available,true);
 assert.equal(garanti?.bankName,'Garanti BBVA');
 assert.equal(garanti?.bankKey,'garanti');
 assert.equal(garanti?.cardAssociation,'MASTERCARD');
 assert.equal(garanti?.source,'local');
 const enpara=localCardInfo('52691100');
 assert.equal(enpara?.bankName,'Enpara');
 assert.equal(enpara?.bankKey,'enpara');
 assert.equal(localCardInfo('00000000'),null);
});
test('checkout is scoped to active root owner and only unpaid orders, prices immutable',async t=>{
 const userFindFirst=db.user.findFirst, orderFindFirst=db.creditOrder.findFirst, gatewayFind=db.paymentGatewaySettings.findUnique;
 (db.paymentGatewaySettings as any).findUnique=async()=>null;
 t.after(()=>{ (db.user as any).findFirst=userFindFirst; (db.creditOrder as any).findFirst=orderFindFirst; (db.paymentGatewaySettings as any).findUnique=gatewayFind; });
 (db.user as any).findFirst=async()=>({id:owner.id,name:'Root',company:'Company',parentCustomerId:null});
 let status='PENDING';
 (db.creditOrder as any).findFirst=async({where}:any)=>{
  assert.equal(where.customerId,owner.id);
  return where.id==='mine'?{id:'mine',number:1,name:'Package',total:{toString:()=>'1250.00'},currency:'TRY',status,customer:{name:'Root',email:'test@example.invalid',phone:'05320000000'}}:null;
 };
 const result=await customerCheckout(owner,'mine');
 assert.equal(result.total,'1250.00');assert.equal(result.paymentAvailable,false);
 await assert.rejects(customerCheckout(owner,'other'),{code:'ORDER_NOT_FOUND'});
 status='PAID';await assert.rejects(customerCheckout(owner,'mine'),{code:'ORDER_NOT_PENDING'});
 (db.user as any).findFirst=async()=>({id:owner.id,parentCustomerId:'company'});
 await assert.rejects(customerCheckout(owner,'mine'),{code:'PURCHASE_OWNER_ONLY'});
 await assert.rejects(customerCardInfo(owner,{bin:'41579200'}),{code:'PURCHASE_OWNER_ONLY'});
 await assert.rejects(customerCheckout({...owner,role:'ADMIN'},'mine'),{code:'FORBIDDEN'});
});
