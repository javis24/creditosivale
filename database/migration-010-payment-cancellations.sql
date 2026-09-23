-- Ejecutar una sola vez en la base existente antes de desplegar el código.
-- Conserva el pago original para auditoría y permite revertir sus efectos.

ALTER TABLE loan_payments
  ADD COLUMN status ENUM('aplicado', 'cancelado')
    NOT NULL DEFAULT 'aplicado' AFTER notes,
  ADD COLUMN cancellation_reason VARCHAR(500) NULL AFTER status,
  ADD COLUMN cancelled_at DATETIME NULL AFTER cancellation_reason,
  ADD COLUMN cancelled_by BIGINT UNSIGNED NULL AFTER cancelled_at,
  ADD KEY idx_loan_payments_status (loan_id, status),
  ADD KEY idx_loan_payments_cancelled_by (cancelled_by),
  ADD CONSTRAINT fk_loan_payments_cancelled_by
    FOREIGN KEY (cancelled_by) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE RESTRICT;
