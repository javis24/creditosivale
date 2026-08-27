
-- Compatible con MySQL 8 y MariaDB 10.5+.

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uuid CHAR(36) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  paternal_last_name VARCHAR(100) NOT NULL DEFAULT '',
  maternal_last_name VARCHAR(100) NULL,
  email VARCHAR(190) NULL,
  phone VARCHAR(20) NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'gerencia', 'vendedor', 'cliente') NOT NULL DEFAULT 'cliente',
  status ENUM('activo', 'inactivo', 'bloqueado') NOT NULL DEFAULT 'activo',
  failed_login_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until DATETIME NULL,
  last_login_at DATETIME NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_uuid (uuid),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_phone (phone),
  KEY idx_users_role_status (role, status),
  KEY idx_users_name (paternal_last_name, maternal_last_name, first_name),
  CONSTRAINT fk_users_created_by
    FOREIGN KEY (created_by) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS credit_options (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  amount DECIMAL(10,2) NOT NULL,
  term_fortnights TINYINT UNSIGNED NOT NULL,
  fortnight_payment DECIMAL(10,2) NOT NULL,
  status ENUM('activo', 'inactivo') NOT NULL DEFAULT 'activo',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_credit_options_amount_term (amount, term_fortnights),
  KEY idx_credit_options_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO credit_options (amount, term_fortnights, fortnight_payment) VALUES
  (1000, 6, 226), (1000, 8, 175), (1000, 10, 145), (1000, 12, 123),
  (1500, 6, 338), (1500, 8, 263), (1500, 10, 216), (1500, 12, 185),
  (2000, 6, 452), (2000, 8, 350), (2000, 10, 289), (2000, 12, 246),
  (2500, 6, 562), (2500, 8, 438), (2500, 10, 362), (2500, 12, 308),
  (3000, 8, 525), (3000, 10, 433), (3000, 12, 368),
  (3500, 8, 613), (3500, 10, 508), (3500, 12, 431),
  (4000, 8, 700), (4000, 10, 578), (4000, 12, 493),
  (4500, 8, 788), (4500, 10, 653), (4500, 12, 555),
  (5000, 8, 875), (5000, 10, 724), (5000, 12, 616),
  (5500, 8, 970), (5500, 10, 799), (5500, 12, 682),
  (6000, 10, 875), (6000, 12, 745)
ON DUPLICATE KEY UPDATE
  fortnight_payment = VALUES(fortnight_payment),
  status = 'activo';

CREATE TABLE IF NOT EXISTS loan_applications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uuid CHAR(36) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  status ENUM(
    'borrador',
    'en_revision',
    'aprobado',
    'rechazado',
    'cancelado'
  ) NOT NULL DEFAULT 'borrador',
  requested_amount DECIMAL(10,2) NOT NULL,
  term_fortnights TINYINT UNSIGNED NOT NULL,
  fortnight_payment DECIMAL(10,2) NOT NULL,
  total_payment DECIMAL(10,2) NOT NULL,
  purpose VARCHAR(300) NULL,
  privacy_notice_version VARCHAR(30) NULL,
  privacy_consent_at DATETIME NULL,
  biometric_consent_at DATETIME NULL,
  promissory_note_version VARCHAR(30) NULL,
  promissory_note_text LONGTEXT NULL,
  promissory_note_hash CHAR(64) NULL,
  signed_at DATETIME NULL,
  signer_ip_hash CHAR(64) NULL,
  signer_user_agent VARCHAR(500) NULL,
  submitted_at DATETIME NULL,
  reviewed_by BIGINT UNSIGNED NULL,
  reviewed_at DATETIME NULL,
  rejection_reason VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_loan_applications_uuid (uuid),
  KEY idx_loan_applications_user_status (user_id, status),
  KEY idx_loan_applications_status_date (status, submitted_at),
  CONSTRAINT fk_loan_applications_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_loan_applications_reviewer
    FOREIGN KEY (reviewed_by) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS client_documents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  application_id BIGINT UNSIGNED NOT NULL,
  document_type ENUM(
    'ine_front',
    'ine_back',
    'face_photo',
    'address_proof',
    'signature'
  ) NOT NULL,
  blob_url VARCHAR(1000) NOT NULL,
  blob_pathname VARCHAR(700) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes INT UNSIGNED NOT NULL,
  sha256 CHAR(64) NOT NULL,
  verification_status ENUM('pendiente', 'verificado', 'rechazado')
    NOT NULL DEFAULT 'pendiente',
  rejection_reason VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_client_documents_application_type (application_id, document_type),
  KEY idx_client_documents_verification (verification_status),
  CONSTRAINT fk_client_documents_application
    FOREIGN KEY (application_id) REFERENCES loan_applications(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS application_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  application_id BIGINT UNSIGNED NOT NULL,
  actor_user_id BIGINT UNSIGNED NULL,
  event_type VARCHAR(80) NOT NULL,
  event_hash CHAR(64) NOT NULL,
  metadata_json LONGTEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_application_events_application (application_id, created_at),
  CONSTRAINT fk_application_events_application
    FOREIGN KEY (application_id) REFERENCES loan_applications(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_application_events_actor
    FOREIGN KEY (actor_user_id) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  notification_type VARCHAR(80) NOT NULL,
  title VARCHAR(190) NOT NULL,
  message VARCHAR(1000) NOT NULL,
  read_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notifications_user_read (user_id, read_at, created_at),
  CONSTRAINT fk_notifications_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS client_profiles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  birth_date DATE NOT NULL,
  curp CHAR(18) NULL,
  rfc VARCHAR(13) NULL,
  ine_number VARCHAR(30) NULL,
  gender ENUM('mujer', 'hombre', 'no_especificado') NOT NULL DEFAULT 'no_especificado',
  marital_status ENUM('soltero', 'casado', 'union_libre', 'divorciado', 'viudo', 'otro') NULL,
  occupation VARCHAR(150) NULL,
  company_name VARCHAR(190) NULL,
  monthly_income DECIMAL(12,2) NOT NULL DEFAULT 0,
  address TEXT NULL,
  street VARCHAR(190) NULL,
  exterior_number VARCHAR(20) NULL,
  interior_number VARCHAR(20) NULL,
  neighborhood VARCHAR(150) NULL,
  postal_code VARCHAR(10) NOT NULL,
  city VARCHAR(120) NULL,
  state VARCHAR(120) NULL,
  country VARCHAR(80) NOT NULL DEFAULT 'México',
  emergency_contact_name VARCHAR(190) NULL,
  emergency_contact_phone VARCHAR(20) NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_client_profiles_user (user_id),
  UNIQUE KEY uq_client_profiles_curp (curp),
  UNIQUE KEY uq_client_profiles_rfc (rfc),
  KEY idx_client_profiles_location (state, city),
  CONSTRAINT fk_client_profiles_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
