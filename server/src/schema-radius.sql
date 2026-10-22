-- =====================================================
-- NetBill Schema — FreeRADIUS compatible tables
-- Digunakan oleh FreeRADIUS (rlm_sql) untuk autentikasi
-- & accounting PPPoE. NetBill sinkron ke tabel ini.
-- =====================================================
USE netbill;

CREATE TABLE IF NOT EXISTS radcheck (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(64) NOT NULL,
  attribute VARCHAR(64) NOT NULL,
  op CHAR(2) NOT NULL DEFAULT ':=',
  value VARCHAR(253) NOT NULL,
  UNIQUE KEY uq_radcheck (username, attribute)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS radreply (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(64) NOT NULL,
  attribute VARCHAR(64) NOT NULL,
  op CHAR(2) NOT NULL DEFAULT '=',
  value VARCHAR(253) NOT NULL,
  UNIQUE KEY uq_radreply (username, attribute)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS radacct (
  radacctid BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  acctsessionid VARCHAR(64) NOT NULL,
  acctuniqueid VARCHAR(32) NULL,
  username VARCHAR(64) NOT NULL,
  nasipaddress VARCHAR(15) NULL,
  nasportid VARCHAR(32) NULL,
  acctstarttime DATETIME NULL,
  acctupdatetime DATETIME NULL,
  acctstoptime DATETIME NULL,
  acctsessiontime INT UNSIGNED NULL,
  acctinputoctets BIGINT UNSIGNED NULL,
  acctoutputoctets BIGINT UNSIGNED NULL,
  calledstationid VARCHAR(50) NULL,
  callingstationid VARCHAR(50) NULL,
  framedipaddress VARCHAR(15) NULL,
  KEY idx_acct_user (username, acctstarttime)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS nas (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nasname VARCHAR(128) NOT NULL,
  shortname VARCHAR(32) NULL,
  secret VARCHAR(60) NOT NULL DEFAULT 'secret',
  description VARCHAR(200) NULL
) ENGINE=InnoDB;
