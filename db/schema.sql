-- Agente de escucha: hilos encontrados, borradores, estados y registro de acciones.
-- No se guarda el autor de los hilos ni ningún dato personal: solo URL, título y extracto públicos.

CREATE TABLE IF NOT EXISTS threads (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  source            VARCHAR(16)  NOT NULL,            -- reddit | hn | github
  external_id       VARCHAR(128) NOT NULL,
  url               VARCHAR(512) NOT NULL,
  community         VARCHAR(128) NOT NULL,            -- subreddit, "hn" o repositorio
  title             VARCHAR(512) NOT NULL,
  excerpt           TEXT,
  thread_created_at DATETIME     NULL,
  found_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  prefilter_score   INT          NOT NULL DEFAULT 0,
  matched_terms     VARCHAR(512) NULL,
  -- pendiente: pasó el filtro, espera a Claude | no_relevante: Claude lo descartó
  -- en_cola: borrador listo para revisión | aprobado | publicado | descartado | error
  status            VARCHAR(16)  NOT NULL DEFAULT 'pendiente',
  relevance_score   INT          NULL,
  theme             VARCHAR(48)  NULL,
  persona           VARCHAR(32)  NULL,
  language          VARCHAR(8)   NULL,
  question_summary  TEXT         NULL,
  reply             TEXT         NULL,
  mentions_brand    TINYINT(1)   NULL,
  risks             JSON         NULL,
  lint              JSON         NULL,
  content_idea      TEXT         NULL,
  link_url          VARCHAR(1024) NULL,
  model             VARCHAR(64)  NULL,
  edited_by         VARCHAR(255) NULL,
  edited_at         DATETIME(6)  NULL,
  approved_by       VARCHAR(255) NULL,
  approved_at       DATETIME     NULL,
  posted_by         VARCHAR(255) NULL,
  posted_at         DATETIME     NULL,
  posted_url        VARCHAR(512) NULL,
  discard_reason    VARCHAR(255) NULL,
  UNIQUE KEY uq_source_ext (source, external_id),
  KEY ix_status (status),
  KEY ix_found (found_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS thread_events (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  thread_id  INT          NOT NULL,
  actor      VARCHAR(255) NOT NULL,                   -- correo de la persona o "agente"
  action     VARCHAR(32)  NOT NULL,
  detail     JSON         NULL,
  at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_thread (thread_id),
  KEY ix_at (at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Acceso con Microsoft: mismo esquema que el tablero LATAM Growth (latam_growth/db/auth-schema.sql).
-- Para desactivar a alguien sin borrarlo:
--   UPDATE users SET status = 'disabled' WHERE email = 'persona@think4ever.com'
CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  entra_oid     VARCHAR(64)  NOT NULL,
  email         VARCHAR(255) NOT NULL,
  display_name  VARCHAR(255) NULL,
  status        ENUM('active','disabled') NOT NULL DEFAULT 'active',
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP NULL DEFAULT NULL,
  UNIQUE KEY uq_users_entra_oid (entra_oid),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Esquema estándar de express-mysql-session.
CREATE TABLE IF NOT EXISTS sessions (
  session_id VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
  expires    INT UNSIGNED NOT NULL,
  data       MEDIUMTEXT COLLATE utf8mb4_bin,
  PRIMARY KEY (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS scan_runs (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  started_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME NULL,
  trigger_by  VARCHAR(255) NOT NULL,
  fetched     INT NOT NULL DEFAULT 0,
  candidates  INT NOT NULL DEFAULT 0,
  new_threads INT NOT NULL DEFAULT 0,
  drafted     INT NOT NULL DEFAULT 0,
  errors      JSON NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
