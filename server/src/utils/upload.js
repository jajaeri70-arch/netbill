import multer from 'multer';
import fs from 'fs';
import path from 'path';
import config from '../config.js';
import { randomString } from './crypto.js';

fs.mkdirSync(config.uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, config.uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '';
    cb(null, `${Date.now()}-${randomString(6)}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /image\/(jpeg|png|jpg|webp)|application\/pdf|text\/csv|application\/vnd\.ms-excel|octet-stream/.test(file.mimetype) || /\.csv$/i.test(file.originalname || '');
    if (!ok) {
      const err = new Error('Tipe file tidak didukung (gunakan gambar, PDF, atau CSV)');
      err.status = 400; // penolakan validasi klien, bukan error server
      return cb(err);
    }
    cb(null, true);
  },
});
