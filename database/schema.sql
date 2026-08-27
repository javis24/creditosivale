-- Ejecuta este archivo dentro de la base seleccionada en phpMyAdmin.
-- Compatible con MySQL 8 y MariaDB 10.5+.

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uuid CHAR(36) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  paternal_last_name VARCHAR(100) NOT NULL DEFAULT '',
  maternal_last_name VARCHAR(100) NULL,
  email VARCHAR(190) NOT NULL,
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
  KEY idx_users_role_status (role, status),
  KEY idx_users_name (paternal_last_name, maternal_last_name, first_name),
  CONSTRAINT fk_users_created_by
    FOREIGN KEY (created_by) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE SET NULL
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
  occupation VARCHAR(150) NOT NULL,
  company_name VARCHAR(190) NULL,
  monthly_income DECIMAL(12,2) NOT NULL DEFAULT 0,
  street VARCHAR(190) NOT NULL,
  exterior_number VARCHAR(20) NOT NULL,
  interior_number VARCHAR(20) NULL,
  neighborhood VARCHAR(150) NOT NULL,
  postal_code VARCHAR(10) NOT NULL,
  city VARCHAR(120) NOT NULL,
  state VARCHAR(120) NOT NULL,
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
