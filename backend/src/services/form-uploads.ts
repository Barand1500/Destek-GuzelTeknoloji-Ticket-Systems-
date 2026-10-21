import type { Request } from 'express';
import type multer from 'multer';
import { AppError } from '../utils/errors.js';

export const FORM_UPLOAD_BYTES = 30 * 1024 * 1024;

// Enforce the aggregate budget while streaming, before buffering an unlimited
// number of files. Each request has its own counter; file count is unrestricted.
export function formUploadStorage(): multer.StorageEngine {
  const requests = new WeakMap<Request, { total: number; exceeded: boolean }>();
  return {
    _handleFile(req, file, callback) {
      let usage = requests.get(req);
      if (!usage) { usage = { total: 0, exceeded: false }; requests.set(req, usage); }
      const budget = usage;
      let chunks: Buffer[] = [], size = 0, finished = false;
      const finish = (error?: Error) => {
        if (finished) return;
        finished = true;
        if (error) { chunks = []; callback(error); }
        else { callback(null, { buffer: Buffer.concat(chunks), size }); chunks = []; }
      };
      file.stream.on('data', (chunk: Buffer) => {
        budget.total += chunk.length;
        if (budget.total > FORM_UPLOAD_BYTES) budget.exceeded = true;
        if (budget.exceeded) { finish(new AppError(400, 'UPLOAD_LIMIT', 'Dosyaların toplam boyutu en fazla 30 MB olabilir.')); return; }
        if (!finished) { chunks.push(chunk); size += chunk.length; }
      });
      file.stream.on('end', () => finish());
      file.stream.on('error', error => finish(error));
    },
    _removeFile(_req, file, callback) {
      delete (file as Partial<Express.Multer.File>).buffer;
      callback(null);
    },
  };
}
