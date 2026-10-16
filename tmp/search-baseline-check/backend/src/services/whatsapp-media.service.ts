import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

const GRAPH_API = 'https://graph.facebook.com/v25.0';
const imageExtensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png' };

export async function downloadWhatsappImage(mediaId: string, accessToken: string, phoneNumberId: string): Promise<Express.Multer.File> {
  if (!accessToken || !phoneNumberId) throw new AppError(502, 'WHATSAPP_MEDIA_FAILED', 'WhatsApp fotoğraf indirme ayarları eksik.');
  const headers = { Authorization: `Bearer ${accessToken}` };
  const metadataResponse = await fetch(`${GRAPH_API}/${encodeURIComponent(mediaId)}?phone_number_id=${encodeURIComponent(phoneNumberId)}`, { headers, signal: AbortSignal.timeout(15_000) });
  if (!metadataResponse.ok) throw new AppError(502, 'WHATSAPP_MEDIA_FAILED', 'WhatsApp fotoğraf bilgisi alınamadı.');
  const metadata = await metadataResponse.json() as { url?: string; mime_type?: string; file_size?: number };
  const extension = imageExtensions[metadata.mime_type ?? ''];
  const limit = Math.min(env.MAX_FILE_SIZE, 5 * 1024 * 1024);
  if (!extension || !metadata.url || (metadata.file_size !== undefined && metadata.file_size > limit)) throw new AppError(400, 'INVALID_FILE', 'WhatsApp fotoğrafının türü veya boyutu desteklenmiyor.');
  const url = new URL(metadata.url);
  // Never send the access token to an arbitrary host or through redirects.
  if (url.protocol !== 'https:' || !['facebook.com', 'fbcdn.net', 'fbsbx.com'].some(host => url.hostname === host || url.hostname.endsWith(`.${host}`)) || url.username || url.password || (url.port && url.port !== '443')) throw new AppError(502, 'WHATSAPP_MEDIA_FAILED', 'WhatsApp fotoğraf adresi geçersiz.');
  const response = await fetch(url, { headers, redirect: 'error', signal: AbortSignal.timeout(30_000) });
  if (!response.ok || !response.body) throw new AppError(502, 'WHATSAPP_MEDIA_FAILED', 'WhatsApp fotoğrafı indirilemedi.');
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
  return { originalname: `whatsapp-${mediaId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100)}.${extension}`, mimetype: metadata.mime_type!, size, buffer: Buffer.concat(chunks) } as Express.Multer.File;
}
