-- Módulo de cartera, calendario quincenal e historial de pagos.
-- Ejecuta una sola vez en phpMyAdmin después de migration-004.

CREATE TABLE IF NOT EXISTS loans (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uuid CHAR(36) NOT NULL,
  application_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  status ENUM(
    'pendiente_desembolso',
    'activo',
    'liquidado',
    'cancelado'
  ) NOT NULL DEFAULT 'pendiente_desembolso',
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
  CONSTRAINT fk_loans_application
    FOREIGN KEY (application_id) REFERENCES loan_applications(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_loans_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_loans_activated_by
    FOREIGN KEY (activated_by) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE SET NULL
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
  CONSTRAINT fk_loan_installments_loan
    FOREIGN KEY (loan_id) REFERENCES loans(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS loan_payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uuid CHAR(36) NOT NULL,
  loan_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  payment_date DATE NOT NULL,
  payment_method ENUM('efectivo', 'transferencia', 'deposito', 'otro')
    NOT NULL,
  reference VARCHAR(120) NULL,
  notes VARCHAR(500) NULL,
  received_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_loan_payments_uuid (uuid),
  KEY idx_loan_payments_loan_date (loan_id, payment_date, created_at),
  KEY idx_loan_payments_receiver (received_by),
  CONSTRAINT fk_loan_payments_loan
    FOREIGN KEY (loan_id) REFERENCES loans(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_loan_payments_received_by
    FOREIGN KEY (received_by) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE RESTRICT
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
  CONSTRAINT fk_payment_allocations_payment
    FOREIGN KEY (payment_id) REFERENCES loan_payments(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_payment_allocations_installment
    FOREIGN KEY (installment_id) REFERENCES loan_installments(id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Recupera solicitudes autorizadas antes de instalar este módulo.
INSERT INTO loans (
  uuid,
  application_id,
  user_id,
  status,
  principal,
  term_fortnights,
  installment_amount,
  total_due,
  amount_paid,
  balance
)
SELECT
  UUID(),
  la.id,
  la.user_id,
  'pendiente_desembolso',
  COALESCE(la.approved_amount, la.requested_amount),
  COALESCE(la.approved_term_fortnights, la.term_fortnights),
  COALESCE(la.approved_fortnight_payment, la.fortnight_payment),
  COALESCE(la.approved_total_payment, la.total_payment),
  0,
  COALESCE(la.approved_total_payment, la.total_payment)
FROM loan_applications la
LEFT JOIN loans l ON l.application_id = la.id
WHERE la.status = 'aprobado'
  AND l.id IS NULL;
