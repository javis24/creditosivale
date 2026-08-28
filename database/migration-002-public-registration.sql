-- Ejecuta esta migración SOLAMENTE si ya habías importado la versión anterior
-- de database/schema.sql. Si crearás la base desde cero, no la necesitas.

ALTER TABLE users
  MODIFY email VARCHAR(190) NULL,
  ADD UNIQUE KEY uq_users_phone (phone);

ALTER TABLE client_profiles
  MODIFY occupation VARCHAR(150) NULL,
  ADD COLUMN address TEXT NULL AFTER monthly_income,
  MODIFY street VARCHAR(190) NULL,
  MODIFY exterior_number VARCHAR(20) NULL,
  MODIFY neighborhood VARCHAR(150) NULL,
  MODIFY city VARCHAR(120) NULL,
  MODIFY state VARCHAR(120) NULL;
