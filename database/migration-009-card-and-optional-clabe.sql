-- Ejecuta una sola vez después de migration-008 si esa migración ya estaba
-- instalada. Conserva las CLABE existentes y agrega la tarjeta de débito.

ALTER TABLE client_payout_accounts
  ADD COLUMN card_ciphertext TEXT NULL AFTER account_holder,
  ADD COLUMN card_iv VARCHAR(40) NULL AFTER card_ciphertext,
  ADD COLUMN card_auth_tag VARCHAR(40) NULL AFTER card_iv,
  ADD COLUMN card_last4 CHAR(4) NULL AFTER card_auth_tag,
  MODIFY COLUMN clabe_ciphertext TEXT NULL,
  MODIFY COLUMN clabe_iv VARCHAR(40) NULL,
  MODIFY COLUMN clabe_auth_tag VARCHAR(40) NULL,
  MODIFY COLUMN clabe_last4 CHAR(4) NULL;

ALTER TABLE payout_account_events
  ADD COLUMN revealed_field ENUM('card', 'clabe') NULL AFTER event_type;
