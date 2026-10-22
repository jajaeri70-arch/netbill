-- =====================================================
-- NetBill Schema — Operasional & Pendukung
-- =====================================================
USE netbill;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS transaction_categories (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  type ENUM('income','expense') NOT NULL,
  description VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_cat (name, type)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS transactions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  type ENUM('income','expense') NOT NULL,
  category_id INT UNSIGNED NULL,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  tx_date DATE NOT NULL,
  description VARCHAR(255) NULL,
  attachment_path VARCHAR(255) NULL,
  status ENUM('approved','pending') NOT NULL DEFAULT 'approved',
  created_by INT UNSIGNED NULL,
  approved_by INT UNSIGNED NULL,
  approved_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_tx_type (type),
  INDEX idx_tx_date (tx_date),
  FOREIGN KEY (category_id) REFERENCES transaction_categories(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS support_tickets (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id INT UNSIGNED NULL,
  ticket_no VARCHAR(32) NULL UNIQUE,
  type ENUM('installation','maintenance') NOT NULL DEFAULT 'maintenance',
  category ENUM('no_connection','slow_connection','broken_cable','device_damage','relocation','other') NULL,
  subject VARCHAR(150) NOT NULL,
  description TEXT NULL,
  contact_name VARCHAR(150) NULL,
  contact_phone VARCHAR(40) NULL,
  installation_address TEXT NULL,
  installation_landmark VARCHAR(255) NULL,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  location_accuracy DECIMAL(10,2) NULL,
  location_captured_at DATETIME NULL,
  priority ENUM('low','normal','high','critical') NOT NULL DEFAULT 'normal',
  status ENUM('open','assigned','on_the_way','in_progress','pending','resolved','closed','cancelled') NOT NULL DEFAULT 'open',
  assigned_to INT UNSIGNED NULL,
  created_by INT UNSIGNED NULL,
  scheduled_at DATETIME NULL,
  due_at DATETIME NULL,
  started_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME NULL,
  closed_at DATETIME NULL,
  resolution_cause TEXT NULL,
  resolution_action TEXT NULL,
  resolution_materials TEXT NULL,
  pending_reason TEXT NULL,
  INDEX idx_ticket_status (status),
  INDEX idx_ticket_assignee (assigned_to, status),
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ticket_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NULL,
  action VARCHAR(40) NOT NULL,
  old_status VARCHAR(20) NULL,
  new_status VARCHAR(20) NULL,
  note TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ticket_event (ticket_id, created_at),
  FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ticket_attachments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id INT UNSIGNED NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  type ENUM('before','after','evidence','house') NOT NULL DEFAULT 'evidence',
  uploaded_by INT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ticket_attachment (ticket_id),
  FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS devices (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  genieacs_device_id VARCHAR(120) NOT NULL UNIQUE,
  customer_id INT UNSIGNED NULL,
  serial VARCHAR(100) NULL,
  model VARCHAR(100) NULL,
  firmware VARCHAR(100) NULL,
  status ENUM('online','offline') NOT NULL DEFAULT 'offline',
  ssid VARCHAR(100) NULL,
  wifi_clients INT UNSIGNED NULL,
  wifi_password VARCHAR(100) NULL,
  rx_power DECIMAL(5,2) NULL,
  tx_power DECIMAL(5,2) NULL,
  temperature DECIMAL(6,2) NULL,
  uptime BIGINT NULL,
  ip_pppoe VARCHAR(45) NULL,
  ip_wan VARCHAR(45) NULL,
  pppoe_username VARCHAR(80) NULL,
  last_inform DATETIME NULL,
  last_sync DATETIME NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS devices_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  device_id INT UNSIGNED NOT NULL,
  status VARCHAR(20) NULL,
  rx_power DECIMAL(5,2) NULL,
  tx_power DECIMAL(5,2) NULL,
  recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_devhist (device_id, recorded_at),
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS devices_ping (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  device_id INT UNSIGNED NOT NULL,
  target VARCHAR(45) NOT NULL,
  ok TINYINT(1) NOT NULL DEFAULT 0,
  latency_ms DECIMAL(8,1) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ping_dev (device_id, id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS pppoe_sessions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id INT UNSIGNED NULL,
  router_id INT UNSIGNED NULL,
  username VARCHAR(80) NOT NULL,
  ip VARCHAR(45) NULL,
  mac VARCHAR(30) NULL,
  uptime INT NOT NULL DEFAULT 0,
  last_logout DATETIME NULL COMMENT 'Logout terakhir sesuai MikroTik (ppp secret last-logged-out)',
  status ENUM('online','offline','isolir') NOT NULL DEFAULT 'offline',
  tx_rate BIGINT NOT NULL DEFAULT 0,
  rx_rate BIGINT NOT NULL DEFAULT 0,
  rx_bytes BIGINT NOT NULL DEFAULT 0 COMMENT 'Total download pelanggan (byte) — counter interface dinamis sesi MikroTik',
  tx_bytes BIGINT NOT NULL DEFAULT 0 COMMENT 'Total upload pelanggan (byte) — counter interface dinamis sesi MikroTik',
  last_change DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_session_user (username),
  INDEX idx_sess_status (status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS connection_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id INT UNSIGNED NULL,
  username VARCHAR(80) NOT NULL,
  event ENUM('up','down','isolir','activate') NOT NULL,
  ip VARCHAR(45) NULL,
  logged_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_connlog_user (customer_id, logged_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS usage_daily (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id INT UNSIGNED NOT NULL,
  d DATE NOT NULL,
  download_bytes BIGINT NOT NULL DEFAULT 0,
  upload_bytes BIGINT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_usage (customer_id, d),
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS activity_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NULL,
  user_name VARCHAR(100) NULL,
  role VARCHAR(20) NULL,
  action VARCHAR(60) NOT NULL,
  module VARCHAR(50) NOT NULL,
  description TEXT NULL,
  ip VARCHAR(45) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_act_user (user_id),
  INDEX idx_act_created (created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS banks (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(60) NOT NULL,
  account_number VARCHAR(40) NOT NULL,
  account_name VARCHAR(100) NOT NULL,
  note VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notifications (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NULL COMMENT 'NULL = broadcast ke semua user',
  title VARCHAR(150) NOT NULL,
  message TEXT NULL,
  type ENUM('info','success','warning','danger') NOT NULL DEFAULT 'info',
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notif_user (user_id, is_read)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS settings (
  skey VARCHAR(60) PRIMARY KEY,
  svalue TEXT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS whatsapp_notification_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_key VARCHAR(120) NOT NULL,
  invoice_id INT UNSIGNED NULL,
  customer_id INT UNSIGNED NULL,
  event_type VARCHAR(30) NOT NULL,
  provider VARCHAR(30) NOT NULL,
  recipient VARCHAR(20) NULL,
  request_payload JSON NULL,
  provider_response JSON NULL,
  provider_message_id VARCHAR(120) NULL,
  status ENUM('processing','sent','failed') NOT NULL DEFAULT 'processing',
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  error_message VARCHAR(500) NULL,
  sent_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wa_event (event_key),
  INDEX idx_wa_invoice (invoice_id),
  INDEX idx_wa_status (status),
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mobile_api_keys (
  id TINYINT UNSIGNED PRIMARY KEY,
  current_hash CHAR(64) NOT NULL,
  current_hint VARCHAR(24) NOT NULL,
  previous_hash CHAR(64) NULL,
  previous_expires_at DATETIME NULL,
  rotated_at DATETIME NOT NULL,
  rotated_by INT UNSIGNED NULL,
  FOREIGN KEY (rotated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS = 1;
