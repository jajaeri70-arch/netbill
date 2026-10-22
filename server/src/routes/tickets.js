import { Router } from 'express';
import { q, exec } from '../db.js';
import { logActivity, num } from '../utils/helper.js';
import { can } from '../middleware/auth.js';
import { notify } from '../utils/notify.js';
import { upload } from '../utils/upload.js';
import { installationPayload } from '../utils/ticketValidation.js';

const r = Router();
const ADMIN = new Set(['owner', 'finance']);
const PRIORITIES = new Set(['low', 'normal', 'high', 'critical']);
const CATEGORIES = new Set(['no_connection', 'slow_connection', 'broken_cable', 'device_damage', 'relocation', 'other']);
const ACTIVE = "('open','assigned','on_the_way','in_progress','pending')";
const ONT_OFFLINE_CATEGORIES = new Set(['broken_cable', 'device_damage']);
const FLOW = { open: ['assigned', 'cancelled'], assigned: ['on_the_way', 'in_progress', 'pending', 'cancelled'], on_the_way: ['in_progress', 'pending'], in_progress: ['pending', 'resolved'], pending: ['assigned', 'cancelled'], resolved: ['closed', 'in_progress'], closed: ['in_progress'], cancelled: [] };
const admin = (req) => ADMIN.has(req.user.role);
const limit = (n) => Math.min(100, Math.max(1, Number(n) || 15));
const hours = (p) => ({ critical: 4, high: 8, normal: 24, low: 72 }[p] || 24);
const number = (type, id) => `${type === 'installation' ? 'INS' : 'MNT'}-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${String(id).padStart(4, '0')}`;
const deviceForCustomer = (customer = 'c') => `(SELECT d.id FROM devices d WHERE d.customer_id=${customer}.id OR (d.pppoe_username IS NOT NULL AND d.pppoe_username<>'' AND d.pppoe_username=${customer}.pppoe_username) OR (d.genieacs_device_id IS NOT NULL AND d.genieacs_device_id=${customer}.genieacs_device_id) OR (d.serial IS NOT NULL AND d.serial<>'' AND d.serial=${customer}.ont_serial) ORDER BY (d.customer_id=${customer}.id) DESC,d.id DESC LIMIT 1)`;
async function event(ticket, user, action, oldStatus = null, newStatus = null, note = null) { await exec('INSERT INTO ticket_events (ticket_id,user_id,action,old_status,new_status,note) VALUES (?,?,?,?,?,?)', [ticket, user, action, oldStatus, newStatus, note]); }
async function owned(id, req) {
  const ticket = (await q('SELECT * FROM support_tickets WHERE id=?', [id]))[0];
  if (!ticket) return { code: 404, message: 'Tiket tidak ditemukan' };
  if (!admin(req) && Number(ticket.assigned_to) !== Number(req.user.id)) return { code: 403, message: 'Tiket ini bukan tugas Anda' };
  return { ticket };
}
async function requireOwned(req, res, next) {
  try { const check = await owned(req.params.id, req); if (check.message) return res.status(check.code).json({ message: check.message }); req.ticket = check.ticket; next(); }
  catch (err) { next(err); }
}

r.get('/', can('tickets'), async (req, res) => {
  try {
    const where = [], params = []; const { status, type, priority, q: search, page = 1 } = req.query; const take = limit(req.query.limit);
    if (!admin(req)) { where.push('t.assigned_to=?'); params.push(req.user.id); }
    for (const [key, column] of [[status, 't.status'], [type, 't.type'], [priority, 't.priority']]) if (key && key !== 'all') { where.push(`${column}=?`); params.push(key); }
    if (search) { const like = `%${String(search).trim()}%`; where.push('(t.ticket_no LIKE ? OR t.subject LIKE ? OR c.name LIKE ? OR t.contact_name LIKE ? OR t.contact_phone LIKE ?)'); params.push(like, like, like, like, like); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : ''; const offset = (Math.max(1, Number(page)) - 1) * take;
    const total = await q(`SELECT COUNT(*) n FROM support_tickets t LEFT JOIN customers c ON c.id=t.customer_id ${w}`, params);
    const rows = await q(`SELECT t.*,COALESCE(c.name,t.contact_name) customer_name,c.code,COALESCE(c.phone,t.contact_phone) phone,COALESCE(c.address,t.installation_address) address,c.area,p.name package_name,u.name assigned_name,CASE WHEN t.due_at<NOW() AND t.status IN ${ACTIVE} THEN 1 ELSE 0 END overdue FROM support_tickets t LEFT JOIN customers c ON c.id=t.customer_id LEFT JOIN packages p ON p.id=c.package_id LEFT JOIN users u ON u.id=t.assigned_to ${w} ORDER BY FIELD(t.status,'in_progress','on_the_way','assigned','open','pending','resolved','closed','cancelled'),FIELD(t.priority,'critical','high','normal','low'),COALESCE(t.scheduled_at,t.created_at) LIMIT ? OFFSET ?`, [...params, take, offset]);
    const counts = await q(`SELECT status,COUNT(*) n FROM support_tickets ${admin(req) ? '' : 'WHERE assigned_to=?'} GROUP BY status`, admin(req) ? [] : [req.user.id]);
    res.json({ rows, total: num(total[0]?.n), counts: Object.fromEntries(counts.map((x) => [x.status, num(x.n)])) });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

r.get('/customers', can('tickets', 'create'), async (req, res) => {
  if (!admin(req)) return res.status(403).json({ message: 'Hanya Admin/Owner dapat membuka ticket maintenance' });
  try {
    const ontOffline = ONT_OFFLINE_CATEGORIES.has(String(req.query.category));
    const deviceJoin = `JOIN devices d ON d.id=${deviceForCustomer()}`;
    const rows = await q(`SELECT c.id,c.code,c.name,c.phone,c.address,c.area,c.latitude,c.longitude,p.name package_name,EXISTS(SELECT 1 FROM support_tickets t WHERE t.customer_id=c.id AND t.type='maintenance' AND t.status IN ${ACTIVE}) has_active_ticket FROM customers c ${ontOffline ? deviceJoin : ''} LEFT JOIN packages p ON p.id=c.package_id WHERE c.status='active'${ontOffline ? " AND d.status='offline'" : ''} ORDER BY c.name LIMIT 300`);
    res.json({ rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

r.get('/technicians', can('tickets'), async (req, res) => {
  if (!admin(req)) return res.status(403).json({ message: 'Hanya Admin/Owner dapat mengatur penugasan' });
  try { res.json({ rows: await q("SELECT id,name,phone FROM users WHERE role='teknisi' AND is_active=1 ORDER BY name") }); } catch (err) { res.status(500).json({ message: err.message }); }
});

r.get('/:id', can('tickets'), async (req, res) => {
  try {
    const check = await owned(req.params.id, req); if (check.message) return res.status(check.code).json({ message: check.message });
    const ticket = (await q(`SELECT t.*,COALESCE(c.name,t.contact_name) customer_name,c.code,COALESCE(c.phone,t.contact_phone) phone,COALESCE(c.address,t.installation_address) address,c.area,p.name package_name,u.name assigned_name FROM support_tickets t LEFT JOIN customers c ON c.id=t.customer_id LEFT JOIN packages p ON p.id=c.package_id LEFT JOIN users u ON u.id=t.assigned_to WHERE t.id=?`, [req.params.id]))[0];
    const [events, attachments] = await Promise.all([q('SELECT e.*,u.name user_name FROM ticket_events e LEFT JOIN users u ON u.id=e.user_id WHERE e.ticket_id=? ORDER BY e.created_at DESC', [req.params.id]), q('SELECT a.*,u.name uploader_name FROM ticket_attachments a LEFT JOIN users u ON u.id=a.uploaded_by WHERE a.ticket_id=? ORDER BY a.created_at DESC', [req.params.id])]);
    res.json({ ticket, events, attachments });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

r.post('/', can('tickets', 'create'), upload.single('house_photo'), async (req, res) => {
  if (!admin(req)) return res.status(403).json({ message: 'Hanya Admin/Owner dapat membuka ticket' });
  try {
    const { customer_id, type = 'maintenance', category = 'other', subject, description, priority = 'normal', assigned_to, scheduled_at } = req.body || {};
    if (!subject || !['installation', 'maintenance'].includes(type) || !PRIORITIES.has(priority) || !CATEGORIES.has(category)) return res.status(400).json({ message: 'Data ticket tidak valid' });
    const installation = type === 'installation' ? installationPayload(req.body) : null;
    if (type === 'installation' && (!installation || !req.file)) return res.status(400).json({ message: 'Nama, WhatsApp, alamat, catatan, titik lokasi, dan foto rumah wajib diisi' });
    if (type === 'maintenance' && !(await q("SELECT id FROM customers WHERE id=? AND status='active'", [customer_id]))[0]) return res.status(404).json({ message: 'Pelanggan tidak ditemukan' });
    if (type === 'maintenance' && ONT_OFFLINE_CATEGORIES.has(category) && !(await q(`SELECT c.id FROM customers c JOIN devices d ON d.id=${deviceForCustomer()} WHERE c.id=? AND d.status='offline'`, [customer_id]))[0]) return res.status(400).json({ message: 'Kategori ini hanya untuk pelanggan dengan ONT offline' });
    if (assigned_to && !(await q("SELECT id FROM users WHERE id=? AND role='teknisi' AND is_active=1", [assigned_to]))[0]) return res.status(400).json({ message: 'Teknisi tidak valid' });
    if (type === 'maintenance' && (await q(`SELECT id FROM support_tickets WHERE customer_id=? AND type='maintenance' AND status IN ${ACTIVE}`, [customer_id]))[0]) return res.status(409).json({ message: 'Pelanggan sudah memiliki ticket maintenance aktif' });
    if (type === 'installation' && (await q(`SELECT id FROM support_tickets WHERE type='installation' AND contact_phone=? AND status IN ${ACTIVE}`, [installation.phone]))[0]) return res.status(409).json({ message: 'WhatsApp ini sudah memiliki ticket pemasangan aktif' });
    const status = assigned_to ? 'assigned' : 'open'; const out = await exec(`INSERT INTO support_tickets (customer_id,type,category,subject,description,contact_name,contact_phone,installation_address,installation_landmark,latitude,longitude,location_accuracy,location_captured_at,priority,status,assigned_to,created_by,scheduled_at,due_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, ?,?,?,?,?,DATE_ADD(NOW(),INTERVAL ${hours(priority)} HOUR))`, [type === 'maintenance' ? customer_id : null,type,category,String(subject).trim(),description || null,installation?.name || null,installation?.phone || null,installation?.address || null,req.body.installation_landmark || null,installation?.latitude || null,installation?.longitude || null,Number(req.body.location_accuracy) || null,req.body.location_captured_at || null,priority,status,assigned_to || null,req.user.id,scheduled_at || null]);
    const no = number(type, out.insertId); await exec('UPDATE support_tickets SET ticket_no=? WHERE id=?', [no, out.insertId]); await event(out.insertId, req.user.id, 'created', null, status, description || null);
    if (req.file) await exec('INSERT INTO ticket_attachments (ticket_id,file_path,type,uploaded_by) VALUES (?,?,?,?)', [out.insertId, `/uploads/${req.file.filename}`, 'house', req.user.id]);
    if (assigned_to) await notify({ userId: assigned_to, title: 'Tugas teknisi baru', message: `${no} · ${subject}`, type: 'info' });
    await logActivity({ req, action: 'tickets.create', module: 'tickets', description: `Membuka ticket ${no}` }); res.status(201).json({ id: out.insertId, ticket_no: no, ok: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

r.patch('/:id/assign', can('tickets', 'edit'), async (req, res) => {
  if (!admin(req)) return res.status(403).json({ message: 'Hanya Admin/Owner dapat menugaskan teknisi' });
  try {
    const check = await owned(req.params.id, req); if (check.message) return res.status(check.code).json({ message: check.message }); const { assigned_to, scheduled_at, priority } = req.body || {}; const nextPriority = priority || check.ticket.priority;
    if (!assigned_to || !PRIORITIES.has(nextPriority) || !['open', 'assigned', 'pending'].includes(check.ticket.status)) return res.status(409).json({ message: 'Penugasan tidak valid untuk status ticket ini' });
    const tech = (await q("SELECT id,name FROM users WHERE id=? AND role='teknisi' AND is_active=1", [assigned_to]))[0]; if (!tech) return res.status(400).json({ message: 'Teknisi tidak valid' });
    await exec(`UPDATE support_tickets SET assigned_to=?,scheduled_at=?,priority=?,status='assigned',due_at=DATE_ADD(NOW(),INTERVAL ${hours(nextPriority)} HOUR) WHERE id=?`, [assigned_to,scheduled_at || null,nextPriority,req.params.id]); await event(req.params.id, req.user.id, 'assigned', check.ticket.status, 'assigned', `Ditugaskan ke ${tech.name}`); await notify({ userId: assigned_to, title: 'Penugasan ticket', message: `${check.ticket.ticket_no || `#${req.params.id}`} dijadwalkan untuk Anda`, type: 'info' }); res.json({ ok: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

r.patch('/:id/status', can('tickets', 'edit'), async (req, res) => {
  try {
    const check = await owned(req.params.id, req); if (check.message) return res.status(check.code).json({ message: check.message }); const { status, pending_reason, note } = req.body || {};
    if (!FLOW[check.ticket.status]?.includes(status)) return res.status(409).json({ message: 'Transisi status tidak diizinkan' }); if (status === 'pending' && !String(pending_reason || '').trim()) return res.status(400).json({ message: 'Alasan penundaan wajib diisi' }); if (status === 'resolved' && (!check.ticket.resolution_cause || !check.ticket.resolution_action)) return res.status(400).json({ message: 'Isi laporan pekerjaan sebelum menyelesaikan ticket' }); if (status === 'resolved' && !(await q('SELECT id FROM ticket_attachments WHERE ticket_id=? LIMIT 1', [req.params.id]))[0]) return res.status(400).json({ message: 'Unggah minimal satu foto bukti sebelum menyelesaikan ticket' }); if (status === 'closed' && !admin(req)) return res.status(403).json({ message: 'Hanya Admin/Owner dapat menutup ticket' });
    await exec("UPDATE support_tickets SET status=?,pending_reason=?,started_at=IF(?='in_progress' AND started_at IS NULL,NOW(),started_at),resolved_at=IF(?='resolved',NOW(),resolved_at),closed_at=IF(?='closed',NOW(),closed_at) WHERE id=?", [status,status === 'pending' ? String(pending_reason).trim() : null,status,status,status,req.params.id]); await event(req.params.id, req.user.id, 'status_changed', check.ticket.status, status, note || pending_reason || null); res.json({ ok: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

r.post('/:id/report', can('tickets', 'edit'), async (req, res) => {
  try { const check = await owned(req.params.id, req); if (check.message) return res.status(check.code).json({ message: check.message }); const { cause, action, materials } = req.body || {}; if (!String(cause || '').trim() || !String(action || '').trim()) return res.status(400).json({ message: 'Penyebab dan tindakan wajib diisi' }); await exec('UPDATE support_tickets SET resolution_cause=?,resolution_action=?,resolution_materials=? WHERE id=?', [String(cause).trim(),String(action).trim(),materials || null,req.params.id]); await event(req.params.id, req.user.id, 'report_submitted', null, null, String(action).trim()); res.json({ ok: true }); } catch (err) { res.status(500).json({ message: err.message }); }
});

r.post('/:id/attachments', can('tickets', 'edit'), requireOwned, upload.single('file'), async (req, res) => {
  try { if (!req.file) return res.status(400).json({ message: 'Foto bukti wajib dipilih' }); const type = ['before', 'after', 'evidence', 'house'].includes(req.body?.type) ? req.body.type : 'evidence'; const out = await exec('INSERT INTO ticket_attachments (ticket_id,file_path,type,uploaded_by) VALUES (?,?,?,?)', [req.params.id, `/uploads/${req.file.filename}`,type,req.user.id]); await event(req.params.id, req.user.id, 'attachment_uploaded', null, null, type); res.status(201).json({ id: out.insertId, path: `/uploads/${req.file.filename}` }); } catch (err) { res.status(500).json({ message: err.message }); }
});

export default r;