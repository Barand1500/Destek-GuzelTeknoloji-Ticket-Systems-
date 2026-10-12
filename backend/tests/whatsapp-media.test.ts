import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { downloadWhatsappImage } from '../src/services/whatsapp-media.service.js';
import { validateFile } from '../src/services/uploads.service.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5xkAAAAASUVORK5CYII=', 'base64');
test('WhatsApp image download authenticates both requests and validates the image content', async () => {
  const original = globalThis.fetch;
  const calls: string[] = [];
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer test-token');
      calls.push(String(url));
      if (calls.length === 1) return Response.json({ url: 'https://lookaside.fbsbx.com/whatsapp_business/attachments/123', mime_type: 'image/png', file_size: png.length });
      return new Response(png);
    };
    // Meta's media endpoint uses fbsbx.com, not the Graph API host.
    const file = await downloadWhatsappImage('123', 'test-token', '456');
    assert.match(calls[0], /123\?phone_number_id=456$/);
    assert.equal(file.originalname, 'whatsapp-123.png');
    assert.equal((await validateFile(file)).mimeType, 'image/png');
    assert.deepEqual(file.buffer, png);
  } finally { globalThis.fetch = original; }
});

test('WhatsApp image download rejects provider failures, arbitrary URLs, oversized streams and invalid image bytes', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('', { status: 401 });
    await assert.rejects(downloadWhatsappImage('123', 'token', '456'), /fotoğraf bilgisi/);
    let downloads = 0;
    globalThis.fetch = async () => { downloads++; return Response.json({ url: 'https://example.com/private', mime_type: 'image/png' }); };
    await assert.rejects(downloadWhatsappImage('123', 'token', '456'), /adresi geçersiz/);
    assert.equal(downloads, 1);
    globalThis.fetch = async () => Response.json({ url: 'https://lookaside.fbsbx.com/image', mime_type: 'image/png', file_size: 6 * 1024 * 1024 });
    await assert.rejects(downloadWhatsappImage('123', 'token', '456'), /türü veya boyutu/);
    let call = 0;
    globalThis.fetch = async () => ++call % 2 === 1 ? Response.json({ url: 'https://lookaside.fbsbx.com/image', mime_type: 'image/png' }) : new Response(Buffer.alloc(6 * 1024 * 1024));
    await assert.rejects(downloadWhatsappImage('123', 'token', '456'), /boyutu aşıyor/);
    globalThis.fetch = async () => ++call % 2 === 1 ? Response.json({ url: 'https://lookaside.fbsbx.com/image', mime_type: 'image/png' }) : new Response('not an image');
    await assert.rejects(validateFile(await downloadWhatsappImage('123', 'token', '456')), /içeriği/);
  } finally { globalThis.fetch = original; }
});
