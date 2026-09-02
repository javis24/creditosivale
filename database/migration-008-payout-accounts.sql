-- Ejecuta una sola vez en phpMyAdmin después de migration-007.
-- La tarjeta y la CLABE se cifran en la aplicación; MySQL no recibe esos
-- números en texto plano.

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
