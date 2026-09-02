-- Ejecuta este archivo dentro de la base seleccionada en phpMyAdmin.
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
  (1000, 6, 244), (1000, 8, 193), (1000, 10, 163), (1000, 12, 141),
  (1500, 6, 356), (1500, 8, 281), (1500, 10, 234), (1500, 12, 203),
  (2000, 6, 470), (2000, 8, 368), (2000, 10, 307), (2000, 12, 264),
  (2500, 6, 580), (2500, 8, 456), (2500, 10, 380), (2500, 12, 326),
  (3000, 8, 543), (3000, 10, 451), (3000, 12, 386),
  (3500, 8, 631), (3500, 10, 526), (3500, 12, 449),
  (4000, 8, 718), (4000, 10, 596), (4000, 12, 511),
  (4500, 8, 806), (4500, 10, 671), (4500, 12, 573),
  (5000, 8, 893), (5000, 10, 742), (5000, 12, 634),
  (5500, 8, 988), (5500, 10, 817), (5500, 12, 700),
  (6000, 10, 893), (6000, 12, 763)
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
    'oferta_pendiente',
    'aprobado',
    'rechazado',
    'cancelado'
  ) NOT NULL DEFAULT 'borrador',
  flow_version TINYINT UNSIGNED NOT NULL DEFAULT 2,
  requested_amount DECIMAL(10,2) NOT NULL,
  offered_amount DECIMAL(10,2) NULL,
  approved_amount DECIMAL(10,2) NULL,
  term_fortnights TINYINT UNSIGNED NOT NULL,
  offered_term_fortnights TINYINT UNSIGNED NULL,
  approved_term_fortnights TINYINT UNSIGNED NULL,
  fortnight_payment DECIMAL(10,2) NOT NULL,
  offered_fortnight_payment DECIMAL(10,2) NULL,
  approved_fortnight_payment DECIMAL(10,2) NULL,
  total_payment DECIMAL(10,2) NOT NULL,
  offered_total_payment DECIMAL(10,2) NULL,
  approved_total_payment DECIMAL(10,2) NULL,
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
  offered_by BIGINT UNSIGNED NULL,
  offered_at DATETIME NULL,
  offer_accepted_at DATETIME NULL,
  reviewed_by BIGINT UNSIGNED NULL,
  reviewed_at DATETIME NULL,
  rejection_reason VARCHAR(500) NULL,
  review_notes VARCHAR(1000) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_loan_applications_uuid (uuid),
  KEY idx_loan_applications_user_status (user_id, status),
  KEY idx_loan_applications_status_date (status, submitted_at),
  KEY idx_loan_applications_offer (status, offered_at),
  CONSTRAINT fk_loan_applications_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_loan_applications_reviewer
    FOREIGN KEY (reviewed_by) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_loan_applications_offered_by
    FOREIGN KEY (offered_by) REFERENCES users(id)
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
  verified_by BIGINT UNSIGNED NULL,
  verified_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_client_documents_application_type (application_id, document_type),
  KEY idx_client_documents_verification (verification_status),
  KEY idx_client_documents_reviewer (verified_by),
  CONSTRAINT fk_client_documents_application
    FOREIGN KEY (application_id) REFERENCES loan_applications(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_client_documents_reviewer
    FOREIGN KEY (verified_by) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE SET NULL
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

CREATE TABLE IF NOT EXISTS client_payout_accounts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uuid CHAR(36) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  bank_name VARCHAR(120) NOT NULL,
  account_holder VARCHAR(190) NOT NULL,
  card_ciphertext TEXT NOT NULL,
  card_iv VARCHAR(40) NOT NULL,
  card_auth_tag VARCHAR(40) NOT NULL,
  card_last4 CHAR(4) NOT NULL,
  clabe_ciphertext TEXT NULL,
  clabe_iv VARCHAR(40) NULL,
  clabe_auth_tag VARCHAR(40) NULL,
  clabe_last4 CHAR(4) NULL,
  consent_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_client_payout_accounts_uuid (uuid),
  UNIQUE KEY uq_client_payout_accounts_user (user_id),
  CONSTRAINT fk_client_payout_accounts_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payout_account_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  payout_account_id BIGINT UNSIGNED NOT NULL,
  actor_user_id BIGINT UNSIGNED NOT NULL,
  application_id BIGINT UNSIGNED NULL,
  event_type ENUM('account_saved', 'account_revealed') NOT NULL,
  revealed_field ENUM('card', 'clabe') NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_payout_account_events_account (payout_account_id, created_at),
  KEY idx_payout_account_events_actor (actor_user_id, created_at),
  CONSTRAINT fk_payout_account_events_account
    FOREIGN KEY (payout_account_id) REFERENCES client_payout_accounts(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_payout_account_events_actor
    FOREIGN KEY (actor_user_id) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_payout_account_events_application
    FOREIGN KEY (application_id) REFERENCES loan_applications(id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS loans (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uuid CHAR(36) NOT NULL,
  application_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  status ENUM('pendiente_desembolso', 'activo', 'liquidado', 'cancelado')
    NOT NULL DEFAULT 'pendiente_desembolso',
  principal DECIMAL(10,2) NOT NULL,
  term_fortnights TINYINT UNSIGNED NOT NULL,
  installment_amount DECIMAL(10,2) NOT NULL,
  total_due DECIMAL(10,2) NOT NULL,
  amount_paid DECIMAL(10,2) NOT NULL DEFAULT 0,
  balance DECIMAL(10,2) NOT NULL,
  disbursement_date DATE NULL,
  first_due_date DATE NULL,
  maturity_date DATE NULL,
  activated_by BIGINT UNSIGNED NULL,
  activated_at DATETIME NULL,
  liquidated_at DATETIME NULL,
  cancelled_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_loans_uuid (uuid),
  UNIQUE KEY uq_loans_application (application_id),
  KEY idx_loans_user_status (user_id, status),
  KEY idx_loans_status_due (status, maturity_date),
  CONSTRAINT fk_loans_application FOREIGN KEY (application_id)
    REFERENCES loan_applications(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_loans_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_loans_activated_by FOREIGN KEY (activated_by)
    REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS loan_installments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uuid CHAR(36) NOT NULL,
  loan_id BIGINT UNSIGNED NOT NULL,
  installment_number TINYINT UNSIGNED NOT NULL,
  due_date DATE NOT NULL,
  amount_due DECIMAL(10,2) NOT NULL,
  amount_paid DECIMAL(10,2) NOT NULL DEFAULT 0,
  status ENUM('pendiente', 'parcial', 'pagado', 'vencido')
    NOT NULL DEFAULT 'pendiente',
  paid_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_loan_installments_uuid (uuid),
  UNIQUE KEY uq_loan_installments_number (loan_id, installment_number),
  KEY idx_loan_installments_due (loan_id, status, due_date),
  CONSTRAINT fk_loan_installments_loan FOREIGN KEY (loan_id)
    REFERENCES loans(id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS loan_payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uuid CHAR(36) NOT NULL,
  loan_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  payment_date DATE NOT NULL,
  payment_method ENUM('efectivo', 'transferencia', 'deposito', 'otro') NOT NULL,
  reference VARCHAR(120) NULL,
  notes VARCHAR(500) NULL,
  received_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_loan_payments_uuid (uuid),
  KEY idx_loan_payments_loan_date (loan_id, payment_date, created_at),
  KEY idx_loan_payments_receiver (received_by),
  CONSTRAINT fk_loan_payments_loan FOREIGN KEY (loan_id)
    REFERENCES loans(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_loan_payments_received_by FOREIGN KEY (received_by)
    REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS loan_payment_allocations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  payment_id BIGINT UNSIGNED NOT NULL,
  installment_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_installment_allocation (payment_id, installment_id),
  KEY idx_payment_allocations_installment (installment_id),
  CONSTRAINT fk_payment_allocations_payment FOREIGN KEY (payment_id)
    REFERENCES loan_payments(id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_payment_allocations_installment FOREIGN KEY (installment_id)
    REFERENCES loan_installments(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
