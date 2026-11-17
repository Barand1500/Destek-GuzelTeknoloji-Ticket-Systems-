import { db } from '../config/db.js';
import { env } from '../config/env.js';
import type { Prisma } from '../generated/prisma/client.js';
export type CreditAlertChannel = 'IN_APP'|'EMAIL'|'SMS'|'WHATSAPP';
export function selectedCreditChannels(raw: unknown): CreditAlertChannel[] {
 if(raw==null) return ['IN_APP'];
 if(!Array.isArray(raw)) return [];
 return [...new Set(raw.filter((v):v is CreditAlertChannel=>['IN_APP','EMAIL','SMS','WHATSAPP'].includes(v)))];
}
export async function creditChannelAvailability(client: Pick<Prisma.TransactionClient,'integrationSettings'> = db, config:{whatsappCreditTemplateName?:string;whatsappCreditTemplateLanguage?:string}={}) {
 const settings=await client.integrationSettings.findUnique({where:{id:'default'},select:{smtpEnabled:true,smtpHost:true,smtpFromAddress:true,smtpUser:true,smtpPassword:true,smsEnabled:true,smsApiUser:true,smsApiPassword:true,smsSender:true,whatsappEnabled:true,whatsappPhoneNumberId:true,whatsappAccessToken:true}});
 const stored=Boolean(settings && (settings.smtpHost || settings.smtpFromAddress || settings.smtpUser || settings.smtpPassword));
 const email=Boolean((!stored || settings?.smtpEnabled) && (settings?.smtpHost || env.SMTP_HOST) && (settings?.smtpFromAddress || env.SMTP_FROM) && (!(settings?.smtpUser || env.SMTP_USER) || (settings?.smtpPassword || env.SMTP_PASSWORD || env.SMTP_PASS)));
 const sms=Boolean(settings?.smsEnabled && settings.smsApiUser && settings.smsApiPassword && settings.smsSender);
 const whatsapp=Boolean(settings?.whatsappEnabled && settings.whatsappPhoneNumberId && settings.whatsappAccessToken && config.whatsappCreditTemplateName && config.whatsappCreditTemplateLanguage);
 return [
  {channel:'IN_APP' as const,available:true},
  {channel:'EMAIL' as const,available:email,...(!email?{reason:'Giden e-posta bağlantısı gerekli.'}:{})},
  {channel:'SMS' as const,available:sms,...(!sms?{reason:'Etkin SMS bağlantısı gerekli.'}:{})},
  {channel:'WHATSAPP' as const,available:whatsapp,...(!whatsapp?{reason:'Etkin WhatsApp bağlantısı ve onaylı kredi bildirim şablonu gerekli.'}:{})},
 ];
}
