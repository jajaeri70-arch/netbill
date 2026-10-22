import { Router } from 'express';
import { can } from '../middleware/auth.js';
import { upload } from '../utils/upload.js';

const r = Router();

/** POST /api/uploads — unggah file umum (bukti transfer, nota, dsb) */
r.post('/', can('dashboard'), upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'File wajib diunggah' });
  res.json({ ok: true, path: `/uploads/${req.file.filename}`, name: req.file.originalname });
});

export default r;
