import type { Attachment } from 'mailparser';
import { validateFile } from './uploads.service.js';

const extensions: Record<string, string> = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
  'application/pdf': '.pdf', 'text/plain': '.txt', 'application/zip': '.zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
};

export async function prepareInboundEmailAttachments(attachments: Attachment[]) {
  const files: Express.Multer.File[] = [];
  const skipped: string[] = [];
  for (const [index, attachment] of attachments.entries()) {
    const filename = attachment.filename || `ek-${index + 1}${extensions[attachment.contentType] ?? ''}`;
    const file = { originalname: filename, mimetype: attachment.contentType, size: attachment.content.length, buffer: attachment.content } as Express.Multer.File;
    try {
      if (files.length >= 10) throw new Error('En fazla 10 dosya alınabilir.');
      await validateFile(file);
      files.push(file);
    } catch {
      skipped.push(filename.replace(/[\u0000-\u001f\u007f]/g, '').slice(-180));
    }
  }
  return { files, skipped };
}
