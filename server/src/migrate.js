import { pool, q } from './db.js';

/** Migrasi skema inkremental untuk instalasi yang sudah berjalan */
async function columnExists(table, column) {
  const rows = await q(
    `SELECT COUNT(*) n FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return Number(rows[0]?.n) > 0;
}

const MIGRATIONS = [
  { table: 'routers', column: 'scheme', ddl: "ALTER TABLE routers ADD COLUMN scheme VARCHAR(10) NOT NULL DEFAULT 'https'" },
  // Auto Isolir per server — halaman Server Mikrotik (aktifkan, action, profile isolir)
  { table: 'routers', column: 'auto_isolate', ddl: 'ALTER TABLE routers ADD COLUMN auto_isolate TINYINT(1) NOT NULL DEFAULT 1 AFTER location' },
  { table: 'routers', column: 'isolate_action', ddl: "ALTER TABLE routers ADD COLUMN isolate_action VARCHAR(20) NOT NULL DEFAULT 'profile' AFTER auto_isolate" },
  { table: 'routers', column: 'isolate_profile', ddl: "ALTER TABLE routers ADD COLUMN isolate_profile VARCHAR(100) NOT NULL DEFAULT 'isolir' AFTER isolate_action" },
  { table: 'devices', column: 'temperature', ddl: 'ALTER TABLE devices ADD COLUMN temperature DECIMAL(6,2) NULL AFTER tx_power' },
  { table: 'devices', column: 'ip_pppoe', ddl: 'ALTER TABLE devices ADD COLUMN ip_pppoe VARCHAR(45) NULL AFTER uptime' },
  { table: 'devices', column: 'ip_wan', ddl: 'ALTER TABLE devices ADD COLUMN ip_wan VARCHAR(45) NULL AFTER ip_pppoe' },
  { table: 'devices', column: 'pppoe_username', ddl: 'ALTER TABLE devices ADD COLUMN pppoe_username VARCHAR(80) NULL AFTER ip_wan' },
  { table: 'devices', column: 'wifi_clients', ddl: 'ALTER TABLE devices ADD COLUMN wifi_clients INT UNSIGNED NULL AFTER ssid' },
  // Paket modern: router tujuan, harga dasar + PPN, komisi agen & izin aplikasi
  { table: 'packages', column: 'router_id', ddl: 'ALTER TABLE packages ADD COLUMN router_id INT UNSIGNED NULL AFTER mikrotik_profile' },
  { table: 'packages', column: 'base_price', ddl: 'ALTER TABLE packages ADD COLUMN base_price DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER price' },
  { table: 'packages', column: 'tax_rate', ddl: 'ALTER TABLE packages ADD COLUMN tax_rate DECIMAL(5,2) NOT NULL DEFAULT 0 AFTER base_price' },
  { table: 'packages', column: 'agent_commission', ddl: 'ALTER TABLE packages ADD COLUMN agent_commission DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER tax_rate' },
  { table: 'packages', column: 'allow_app_change', ddl: 'ALTER TABLE packages ADD COLUMN allow_app_change TINYINT(1) NOT NULL DEFAULT 1 AFTER agent_commission' },
  { table: 'packages', column: 'allow_online_payment', ddl: 'ALTER TABLE packages ADD COLUMN allow_online_payment TINYINT(1) NOT NULL DEFAULT 1 AFTER allow_app_change' },
  { table: 'invoices', column: 'service_start', ddl: 'ALTER TABLE invoices ADD COLUMN service_start DATE NULL AFTER period' },
  { table: 'invoices', column: 'service_end', ddl: 'ALTER TABLE invoices ADD COLUMN service_end DATE NULL AFTER service_start' },
  { table: 'invoices', column: 'additional_fee', ddl: 'ALTER TABLE invoices ADD COLUMN additional_fee DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER late_fee' },
  // Penagihan & masa aktif — auto isolir/disable via RADIUS + MikroTik (PRD 5.5, alur 9.1)
  // Jenis penagihan: pascabayar (prorata siklus pertama) / prabayar (tanpa prorata)
  { table: 'customers', column: 'billing_type', ddl: "ALTER TABLE customers ADD COLUMN billing_type ENUM('pascabayar','prabayar') NOT NULL DEFAULT 'pascabayar' AFTER billing_day" },
  { table: 'customers', column: 'grace_days', ddl: 'ALTER TABLE customers ADD COLUMN grace_days TINYINT NULL AFTER billing_day' },
  { table: 'customers', column: 'no_auto_isolate', ddl: 'ALTER TABLE customers ADD COLUMN no_auto_isolate TINYINT(1) NOT NULL DEFAULT 0 AFTER grace_days' },
  { table: 'customers', column: 'active_until', ddl: 'ALTER TABLE customers ADD COLUMN active_until DATE NULL AFTER no_auto_isolate' },
  { table: 'customers', column: 'installation_date', ddl: 'ALTER TABLE customers ADD COLUMN installation_date DATE NULL AFTER package_id' },
  { table: 'customers', column: 'installation_status', ddl: "ALTER TABLE customers ADD COLUMN installation_status ENUM('pending','in_progress','installed') NOT NULL DEFAULT 'installed' AFTER installation_date" },
];

async function main() {
  const added = [];
  for (const m of MIGRATIONS) {
    if (await columnExists(m.table, m.column)) {
      console.log(`[migrate] kolom ${m.table}.${m.column} sudah ada — lewati`);
    } else {
      await pool.query(m.ddl);
      added.push(`${m.table}.${m.column}`);
      console.log(`[migrate] kolom ${m.table}.${m.column} ditambahkan`);
    }
  }
  // Status pelanggan 'disabled' (auto disable penagihan via RADIUS/MikroTik)
  const statusCol = await q(`SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'status'`);
  if (statusCol[0] && !String(statusCol[0].COLUMN_TYPE).includes("'disabled'")) {
    await pool.query("ALTER TABLE customers MODIFY COLUMN status ENUM('active','inactive','isolated','disabled') NOT NULL DEFAULT 'active'");
    console.log('[migrate] kolom customers.status mendukung disabled');
  }
  // Backfill paket lama: harga dasar disamakan dengan tarif lama (dianggap tanpa PPN)
  if (added.includes('packages.base_price')) {
    await pool.query('UPDATE packages SET base_price = price WHERE base_price = 0 AND price > 0');
    console.log('[migrate] harga dasar paket lama disamakan dengan tarif');
  }
  if (added.includes('customers.installation_date')) {
    await pool.query('UPDATE customers SET installation_date = activation_date WHERE installation_date IS NULL');
    console.log('[migrate] tanggal pemasangan pelanggan lama disamakan dengan tanggal aktif');
  }
  // Tabel master wilayah/area pelanggan
  await pool.query(`
    CREATE TABLE IF NOT EXISTS areas (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(80) NOT NULL UNIQUE,
      description VARCHAR(255) NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);
  console.log('[migrate] tabel areas siap');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mobile_api_keys (
      id TINYINT UNSIGNED PRIMARY KEY,
      current_hash CHAR(64) NOT NULL,
      current_hint VARCHAR(24) NOT NULL,
      previous_hash CHAR(64) NULL,
      previous_expires_at DATETIME NULL,
      rotated_at DATETIME NOT NULL,
      rotated_by INT UNSIGNED NULL,
      FOREIGN KEY (rotated_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB
  `);
  console.log('[migrate] tabel mobile_api_keys siap');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_notification_logs (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, event_key VARCHAR(120) NOT NULL,
      invoice_id INT UNSIGNED NULL, customer_id INT UNSIGNED NULL, event_type VARCHAR(30) NOT NULL,
      provider VARCHAR(30) NOT NULL, recipient VARCHAR(20) NULL, request_payload JSON NULL,
      provider_response JSON NULL, provider_message_id VARCHAR(120) NULL,
      status ENUM('processing','sent','failed') NOT NULL DEFAULT 'processing',
      attempts TINYINT UNSIGNED NOT NULL DEFAULT 0, error_message VARCHAR(500) NULL,
      sent_at DATETIME NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_wa_event (event_key), INDEX idx_wa_invoice (invoice_id), INDEX idx_wa_status (status),
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
    ) ENGINE=InnoDB
  `);
  console.log('[migrate] tabel whatsapp_notification_logs siap');
  // Riwayat ping perangkat ONT ke gateway (grafik kualitas koneksi)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS devices_ping (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      device_id INT UNSIGNED NOT NULL,
      target VARCHAR(45) NOT NULL,
      ok TINYINT(1) NOT NULL DEFAULT 0,
      latency_ms DECIMAL(8,1) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ping_dev (device_id, id)
    ) ENGINE=InnoDB
  `);
  console.log('[migrate] tabel devices_ping siap');
  await pool.query(`
    UPDATE devices
    SET model = SUBSTRING_INDEX(SUBSTRING_INDEX(genieacs_device_id, '-', -2), '-', 1),
        serial = SUBSTRING_INDEX(genieacs_device_id, '-', -1)
    WHERE genieacs_device_id LIKE '%-%-%'
  `);
  console.log('[migrate] model dan serial ONT diselaraskan dari ID GenieACS');
  await pool.query("UPDATE devices SET temperature = NULL WHERE temperature < -100 OR temperature > 200");
  console.log('[migrate] temperatur di luar rentang -100..200 °C dihapus');
  await pool.query('UPDATE devices SET temperature = NULL WHERE temperature = 0');
  console.log('[migrate] temperatur sentinel 0 °C dihapus');
  await pool.query("UPDATE devices SET rx_power = NULL WHERE rx_power < -100 OR rx_power > 20");
  console.log('[migrate] RX Power di luar rentang -100..20 dBm dihapus');
  await pool.query("ALTER TABLE support_tickets MODIFY priority ENUM('low','normal','high','critical') NOT NULL DEFAULT 'normal'");
  await pool.query("ALTER TABLE support_tickets MODIFY status ENUM('open','assigned','on_the_way','in_progress','pending','resolved','closed','cancelled') NOT NULL DEFAULT 'open'");
  await pool.query('ALTER TABLE support_tickets MODIFY customer_id INT UNSIGNED NULL');
  for (const [column, ddl] of [
    ['ticket_no', 'ALTER TABLE support_tickets ADD COLUMN ticket_no VARCHAR(32) NULL UNIQUE AFTER customer_id'],
    ['type', "ALTER TABLE support_tickets ADD COLUMN type ENUM('installation','maintenance') NOT NULL DEFAULT 'maintenance' AFTER ticket_no"],
    ['category', "ALTER TABLE support_tickets ADD COLUMN category ENUM('no_connection','slow_connection','broken_cable','device_damage','relocation','other') NULL AFTER type"],
    ['scheduled_at', 'ALTER TABLE support_tickets ADD COLUMN scheduled_at DATETIME NULL AFTER created_by'],
    ['due_at', 'ALTER TABLE support_tickets ADD COLUMN due_at DATETIME NULL AFTER scheduled_at'],
    ['started_at', 'ALTER TABLE support_tickets ADD COLUMN started_at DATETIME NULL AFTER due_at'],
    ['closed_at', 'ALTER TABLE support_tickets ADD COLUMN closed_at DATETIME NULL AFTER resolved_at'],
    ['resolution_cause', 'ALTER TABLE support_tickets ADD COLUMN resolution_cause TEXT NULL AFTER closed_at'],
    ['resolution_action', 'ALTER TABLE support_tickets ADD COLUMN resolution_action TEXT NULL AFTER resolution_cause'],
    ['resolution_materials', 'ALTER TABLE support_tickets ADD COLUMN resolution_materials TEXT NULL AFTER resolution_action'],
    ['pending_reason', 'ALTER TABLE support_tickets ADD COLUMN pending_reason TEXT NULL AFTER resolution_materials'],
    ['contact_name', 'ALTER TABLE support_tickets ADD COLUMN contact_name VARCHAR(150) NULL AFTER description'],
    ['contact_phone', 'ALTER TABLE support_tickets ADD COLUMN contact_phone VARCHAR(40) NULL AFTER contact_name'],
    ['installation_address', 'ALTER TABLE support_tickets ADD COLUMN installation_address TEXT NULL AFTER contact_phone'],
    ['installation_landmark', 'ALTER TABLE support_tickets ADD COLUMN installation_landmark VARCHAR(255) NULL AFTER installation_address'],
    ['latitude', 'ALTER TABLE support_tickets ADD COLUMN latitude DECIMAL(10,7) NULL AFTER installation_landmark'],
    ['longitude', 'ALTER TABLE support_tickets ADD COLUMN longitude DECIMAL(10,7) NULL AFTER latitude'],
    ['location_accuracy', 'ALTER TABLE support_tickets ADD COLUMN location_accuracy DECIMAL(10,2) NULL AFTER longitude'],
    ['location_captured_at', 'ALTER TABLE support_tickets ADD COLUMN location_captured_at DATETIME NULL AFTER location_accuracy'],
  ]) {
    if (!await columnExists('support_tickets', column)) await pool.query(ddl);
  }
  await pool.query("ALTER TABLE ticket_attachments MODIFY type ENUM('before','after','evidence','house') NOT NULL DEFAULT 'evidence'");
  for (const [index, ddl] of [
    ['idx_ticket_status', 'ALTER TABLE support_tickets ADD INDEX idx_ticket_status (status)'],
    ['idx_ticket_assignee', 'ALTER TABLE support_tickets ADD INDEX idx_ticket_assignee (assigned_to, status)'],
  ]) {
    const [rows] = await pool.query('SHOW INDEX FROM support_tickets WHERE Key_name=?', [index]);
    if (!rows.length) await pool.query(ddl);
  }
  await pool.query(`CREATE TABLE IF NOT EXISTS ticket_events (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, ticket_id INT UNSIGNED NOT NULL, user_id INT UNSIGNED NULL,
    action VARCHAR(40) NOT NULL, old_status VARCHAR(20) NULL, new_status VARCHAR(20) NULL, note TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX idx_ticket_event (ticket_id, created_at),
    FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ticket_attachments (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, ticket_id INT UNSIGNED NOT NULL, file_path VARCHAR(255) NOT NULL,
    type ENUM('before','after','evidence','house') NOT NULL DEFAULT 'evidence', uploaded_by INT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX idx_ticket_attachment (ticket_id),
    FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB`);
  console.log('[migrate] modul ticket teknisi siap');
  // Enum lama dapat masih berisi admin. Izinkan keduanya sebelum konversi data.
  await pool.query("ALTER TABLE users MODIFY role ENUM('owner','admin','finance','teknisi','kasir') NOT NULL DEFAULT 'finance'");
  await pool.query("UPDATE users SET role = 'finance' WHERE role = 'admin'");
  await pool.query("UPDATE role_permissions SET role = 'finance' WHERE role = 'admin'");
  await pool.query("ALTER TABLE users MODIFY role ENUM('owner','finance','teknisi','kasir') NOT NULL DEFAULT 'finance'");
  await pool.query("UPDATE role_permissions SET can_view = 0, can_create = 0, can_edit = 0, can_delete = 0, can_export = 0 WHERE role NOT IN ('owner', 'finance') AND menu IN ('payments', 'finance', 'transactions', 'categories', 'banks')");
  await pool.query("UPDATE role_permissions SET can_delete = 1 WHERE role = 'finance' AND menu = 'payments'");
  console.log('[migrate] role finance dan izin finansial diselaraskan');
  await pool.end();
  console.log('[migrate] selesai ✓');
}

main().catch((e) => {
  console.error('[migrate] gagal:', e.message);
  process.exit(1);
});
