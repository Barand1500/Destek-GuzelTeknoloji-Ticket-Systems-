import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { uploadRoot, validateFile, type StoredUpload } from './uploads.service.js';

const GRAPH_API = 'https://graph.facebook.com/v25.0';
const imageExtensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png' };
const documentExtensions: Record<string, string> = {
  'application/pdf': 'pdf', 'text/plain': 'txt',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

export function whatsappFileKind(file: Pick<StoredUpload, 'mimeType' | 'size'>): 'image' | 'document' {
  const kind = imageExtensions[file.mimeType] ? 'image' : documentExtensions[file.mimeType] ? 'document' : null;
  if (!kind) throw new AppError(400, 'INVALID_WHATSAPP_FILE', 'WhatsApp için JPG, PNG, PDF, DOCX, XLSX veya TXT dosyası ekleyin.');
  const limit = Math.min(env.MAX_FILE_SIZE, (kind === 'image' ? 5 : 100) * 1024 * 1024);
  if (!file.size || file.size > limit) throw new AppError(400, 'INVALID_WHATSAPP_FILE', `WhatsApp dosyası en fazla ${Math.floor(limit / 1024 / 1024)} MB olabilir.`);
  return kind;
}

export async function downloadWhatsappImage(mediaId: string, accessToken: string, phoneNumberId: string): Promise<Express.Multer.File> {
  return downloadWhatsappMedia(mediaId, accessToken, phoneNumberId, 'image');
}

export async function downloadWhatsappDocument(mediaId: string, accessToken: string, phoneNumberId: string, filename?: string): Promise<Express.Multer.File> {
  return downloadWhatsappMedia(mediaId, accessToken, phoneNumberId, 'document', filename);
}

async function downloadWhatsappMedia(mediaId: string, accessToken: string, phoneNumberId: string, kind: 'image' | 'document', filename?: string): Promise<Express.Multer.File> {
  const label = kind === 'image' ? 'fotoğraf' : 'belge';
  if (!accessToken || !phoneNumberId) throw new AppError(502, 'WHATSAPP_MEDIA_FAILED', 'WhatsApp fotoğraf indirme ayarları eksik.');
  const headers = { Authorization: `Bearer ${accessToken}` };
  const metadataResponse = await fetch(`${GRAPH_API}/${encodeURIComponent(mediaId)}?phone_number_id=${encodeURIComponent(phoneNumberId)}`, { headers, signal: AbortSignal.timeout(15_000) });
  if (!metadataResponse.ok) throw new AppError(502, 'WHATSAPP_MEDIA_FAILED', `WhatsApp ${label} bilgisi alınamadı.`);
  const metadata = await metadataResponse.json() as { url?: string; mime_type?: string; file_size?: number };
  const extension = (kind === 'image' ? imageExtensions : documentExtensions)[metadata.mime_type ?? ''];
  const limit = Math.min(env.MAX_FILE_SIZE, (kind === 'image' ? 5 : 100) * 1024 * 1024);
  if (!extension || !metadata.url || (metadata.file_size !== undefined && metadata.file_size > limit)) throw new AppError(400, 'INVALID_FILE', `WhatsApp ${label} türü veya boyutu desteklenmiyor.`);
  const url = new URL(metadata.url);
  // Never send the access token to an arbitrary host or through redirects.
  if (url.protocol !== 'https:' || !['facebook.com', 'fbcdn.net', 'fbsbx.com'].some(host => url.hostname === host || url.hostname.endsWith(`.${host}`)) || url.username || url.password || (url.port && url.port !== '443')) throw new AppError(502, 'WHATSAPP_MEDIA_FAILED', 'WhatsApp fotoğraf adresi geçersiz.');
  const response = await fetch(url, { headers, redirect: 'error', signal: AbortSignal.timeout(30_000) });
  if (!response.ok || !response.body) throw new AppError(502, 'WHATSAPP_MEDIA_FAILED', `WhatsApp ${label} indirilemedi.`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new AppError(400, 'INVALID_FILE', 'WhatsApp fotoğrafı izin verilen boyutu aşıyor.');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return { originalname: filename || `whatsapp-${mediaId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100)}.${extension}`, mimetype: metadata.mime_type!, size, buffer: Buffer.concat(chunks) } as Express.Multer.File;
}

export async function uploadWhatsappMedia(file: StoredUpload, accessToken: string, phoneNumberId: string): Promise<{ id: string; kind: 'image' | 'document' }> {
  const kind = whatsappFileKind(file);
  const content = await readFile(path.join(uploadRoot, file.storageKey));
  whatsappFileKind({ mimeType: file.mimeType, size: content.length });
  await validateFile({ originalname: file.originalName, mimetype: file.mimeType, size: content.length, buffer: content } as Express.Multer.File);
  const form = new FormData();
  form.set('messaging_product', 'whatsapp');
  form.set('type', file.mimeType);
  form.set('file', new Blob([new Uint8Array(content)], { type: file.mimeType }), file.originalName);
  const response = await fetch(`${GRAPH_API}/${encodeURIComponent(phoneNumberId)}/media`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: form, signal: AbortSignal.timeout(60_000) });
  const data = await response.json() as { id?: string; error?: { message?: string; code?: number } };
  if (!response.ok || !data.id) throw Object.assign(new Error(`WhatsApp dosyası yüklenemedi: ${data.error?.message ?? response.status}${data.error?.code ? ` (Kod: ${data.error.code})` : ''}`), { statusCode: response.status, providerCode: data.error?.code });
  return { id: data.id, kind };
}
