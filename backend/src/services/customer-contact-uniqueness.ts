import type {Prisma} from '../generated/prisma/client.js';
import {canonicalEmail} from '../utils/email.js';
import {AppError} from '../utils/errors.js';

export function customerPhoneKey(value: string) {
  let digits=value.replace(/\D/g,'');
  if(digits.length===14&&digits.startsWith('0090')) digits=digits.slice(4);
  else if(digits.length===12&&digits.startsWith('90')) digits=digits.slice(2);
  else if(digits.length===11&&digits.startsWith('0')) digits=digits.slice(1);
  return digits;
}

// Lock the account range before checking and writing. This also protects concurrent
// creates/edits and compares legacy formatted values without rewriting old records.
export async function assertUniqueCustomerContact(tx:Prisma.TransactionClient, input:{email?:string|null;phone?:string|null}, excludeId?:string) {
  const email=input.email ? canonicalEmail(input.email) : '';
  const phone=input.phone ? customerPhoneKey(input.phone) : '';
  if(!email&&!phone) return;
  const rows=await tx.$queryRaw<{id:string;email:string|null;phone:string|null}[]>`SELECT id, email, phone FROM User WHERE deletedAt IS NULL FOR UPDATE`;
  const others=rows.filter(person=>person.id!==excludeId);
  if(email&&others.some(person=>person.email&&canonicalEmail(person.email)===email)) throw new AppError(409,'CUSTOMER_EMAIL_EXISTS','Bu e-posta adresi başka bir hesapta kullanılıyor. Farklı bir e-posta adresi girin.');
  if(phone&&others.some(person=>person.phone&&customerPhoneKey(person.phone)===phone)) throw new AppError(409,'CUSTOMER_PHONE_EXISTS','Bu telefon numarası başka bir hesapta kullanılıyor. Farklı bir telefon numarası girin.');
}
