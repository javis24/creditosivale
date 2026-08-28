-- Ejecuta una sola vez en phpMyAdmin después de migration-003.
-- Agrega el resultado administrativo sin crear todavía calendario de pagos.

ALTER TABLE loan_applications
  ADD COLUMN approved_amount DECIMAL(10,2) NULL AFTER requested_amount,
  ADD COLUMN approved_term_fortnights TINYINT UNSIGNED NULL AFTER term_fortnights,
  ADD COLUMN approved_fortnight_payment DECIMAL(10,2) NULL AFTER fortnight_payment,
  ADD COLUMN approved_total_payment DECIMAL(10,2) NULL AFTER total_payment,
  ADD COLUMN review_notes VARCHAR(1000) NULL AFTER rejection_reason;

ALTER TABLE client_documents
  ADD COLUMN verified_by BIGINT UNSIGNED NULL AFTER rejection_reason,
  ADD COLUMN verified_at DATETIME NULL AFTER verified_by,
  ADD KEY idx_client_documents_reviewer (verified_by),
  ADD CONSTRAINT fk_client_documents_reviewer
    FOREIGN KEY (verified_by) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE SET NULL;
