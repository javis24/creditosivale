-- Ejecuta una sola vez en phpMyAdmin después de migration-006.
-- Agrega el flujo de contraoferta sin modificar las solicitudes ya firmadas.

ALTER TABLE loan_applications
  MODIFY COLUMN status ENUM(
    'borrador',
    'en_revision',
    'oferta_pendiente',
    'aprobado',
    'rechazado',
    'cancelado'
  ) NOT NULL DEFAULT 'borrador',
  ADD COLUMN flow_version TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER status,
  ADD COLUMN offered_amount DECIMAL(10,2) NULL AFTER requested_amount,
  ADD COLUMN offered_term_fortnights TINYINT UNSIGNED NULL AFTER term_fortnights,
  ADD COLUMN offered_fortnight_payment DECIMAL(10,2) NULL AFTER fortnight_payment,
  ADD COLUMN offered_total_payment DECIMAL(10,2) NULL AFTER total_payment,
  ADD COLUMN offered_by BIGINT UNSIGNED NULL AFTER submitted_at,
  ADD COLUMN offered_at DATETIME NULL AFTER offered_by,
  ADD COLUMN offer_accepted_at DATETIME NULL AFTER offered_at,
  ADD KEY idx_loan_applications_offer (status, offered_at),
  ADD CONSTRAINT fk_loan_applications_offered_by
    FOREIGN KEY (offered_by) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE SET NULL;

-- Las solicitudes existentes continúan usando el flujo firmado anterior.
UPDATE loan_applications
   SET flow_version = 1
 WHERE flow_version IS NULL OR flow_version = 0;
