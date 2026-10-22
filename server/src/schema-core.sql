-- =====================================================
-- NetBill Schema — Core (MySQL 8 / MariaDB)
-- =====================================================
CREATE DATABASE IF NOT EXISTS netbill CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE netbill;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(120) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('owner','finance','teknisi','kasir') NOT NULL DEFAULT 'finance',
  phone VARCHAR(20) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS role_permissions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  role VARCHAR(20) NOT NULL,
  menu VARCHAR(50) NOT NULL,
  can_view TINYINT(1) NOT NULL DEFAULT 0,
  can_create TINYINT(1) NOT NULL DEFAULT 0,
  can_edit TINYINT(1) NOT NULL DEFAULT 0,
  can_delete TINYINT(1) NOT NULL DEFAULT 0,
  can_export TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uq_role_menu (role, menu)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS packages (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  speed VARCHAR(50) NOT NULL,
  price DECIMAL(12,2) NOT NULL DEFAULT 0,
  base_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
  agent_commission DECIMAL(12,2) NOT NULL DEFAULT 0,
  allow_app_change TINYINT(1) NOT NULL DEFAULT 1,
  allow_online_payment TINYINT(1) NOT NULL DEFAULT 1,
  mikrotik_profile VARCHAR(100) NULL,
  router_id INT UNSIGNED NULL,
  description TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS areas (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  description VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS routers (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  host VARCHAR(100) NOT NULL,
  port INT NOT NULL DEFAULT 443,
  scheme VARCHAR(10) NOT NULL DEFAULT 'https',
  api_user VARCHAR(100) NOT NULL,
  api_pass TEXT NULL,
  location VARCHAR(120) NULL,
  auto_isolate TINYINT(1) NOT NULL DEFAULT 1,
  isolate_action VARCHAR(20) NOT NULL DEFAULT 'profile',
  isolate_profile VARCHAR(100) NOT NULL DEFAULT 'isolir',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'unknown',
  last_seen DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS customers (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  nik VARCHAR(30) NULL,
  phone VARCHAR(20) NULL,
  email VARCHAR(120) NULL,
  address TEXT NULL,
  area VARCHAR(80) NULL,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  package_id INT UNSIGNED NULL,
  installation_date DATE NULL,
  installation_status ENUM('pending','in_progress','installed') NOT NULL DEFAULT 'installed',
  activation_date DATE NULL,
  billing_day TINYINT NOT NULL DEFAULT 5,
  billing_type ENUM('pascabayar','prabayar') NOT NULL DEFAULT 'pascabayar',
  grace_days TINYINT NULL,
  no_auto_isolate TINYINT(1) NOT NULL DEFAULT 0,
  active_until DATE NULL,
  status ENUM('active','inactive','isolated') NOT NULL DEFAULT 'active',
  pppoe_username VARCHAR(80) NULL UNIQUE,
  pppoe_password VARCHAR(80) NULL,
  ppp_service VARCHAR(20) NULL,
  ppp_type_ip VARCHAR(30) NULL,
  ppp_local_address VARCHAR(45) NULL,
  ppp_remote_address VARCHAR(45) NULL,
  static_ip VARCHAR(45) NULL,
  odp VARCHAR(80) NULL,
  odc VARCHAR(80) NULL,
  redaman DECIMAL(5,2) NULL,
  ont_brand VARCHAR(60) NULL,
  ont_serial VARCHAR(100) NULL,
  genieacs_device_id VARCHAR(120) NULL,
  tag VARCHAR(60) NULL,
  notes TEXT NULL,
  created_by INT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_cust_status (status),
  INDEX idx_cust_installation_status (installation_status),
  INDEX idx_cust_pkg (package_id),
  FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE SET NULL
) ENGINE=InnoDB;

ALTER TABLE customers ADD COLUMN IF NOT EXISTS ppp_service VARCHAR(20) NULL AFTER pppoe_password;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS ppp_type_ip VARCHAR(30) NULL AFTER ppp_service;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS ppp_local_address VARCHAR(45) NULL AFTER ppp_type_ip;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS ppp_remote_address VARCHAR(45) NULL AFTER ppp_local_address;

CREATE TABLE IF NOT EXISTS customer_attachments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id INT UNSIGNED NOT NULL,
  type ENUM('ktp','rumah','instalasi','perjanjian','lainnya') NOT NULL DEFAULT 'lainnya',
  file_path VARCHAR(255) NOT NULL,
  uploaded_by INT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS customer_package_history (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id INT UNSIGNED NOT NULL,
  old_package_id INT UNSIGNED NULL,
  new_package_id INT UNSIGNED NULL,
  changed_by INT UNSIGNED NULL,
  changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS invoices (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  number VARCHAR(30) NOT NULL UNIQUE,
  customer_id INT UNSIGNED NOT NULL,
  period CHAR(7) NOT NULL,
  service_start DATE NULL,
  service_end DATE NULL,
  invoice_date DATE NOT NULL,
  due_date DATE NOT NULL,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  late_fee DECIMAL(12,2) NOT NULL DEFAULT 0,
  additional_fee DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount DECIMAL(12,2) NOT NULL DEFAULT 0,
  status ENUM('unpaid','partial','paid','void') NOT NULL DEFAULT 'unpaid',
  paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  note VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_invoice_cust_period (customer_id, period),
  INDEX idx_inv_period (period),
  INDEX idx_inv_status (status),
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  invoice_id INT UNSIGNED NOT NULL,
  customer_id INT UNSIGNED NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  method ENUM('cash','transfer','gateway','qris') NOT NULL DEFAULT 'cash',
  bank_id INT UNSIGNED NULL,
  proof_path VARCHAR(255) NULL,
  note VARCHAR(255) NULL,
  status ENUM('confirmed','pending') NOT NULL DEFAULT 'confirmed',
  payment_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by INT UNSIGNED NULL,
  confirmed_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pay_cust (customer_id),
  INDEX idx_pay_date (payment_date),
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS = 1;
