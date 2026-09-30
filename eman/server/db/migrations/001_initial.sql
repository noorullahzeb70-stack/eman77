-- ═══════════════════════════════════════════════════════════════════
-- EMAN database schema — migration 001
-- SQLite (built into Node 22). Portable to PostgreSQL: types are kept
-- simple (TEXT ids, ISO-8601 timestamps, JSON stored as TEXT).
-- ═══════════════════════════════════════════════════════════════════

-- ── Users & auth ─────────────────────────────────────────────────────
CREATE TABLE users (
  id                TEXT PRIMARY KEY,
  email             TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash     TEXT NOT NULL,
  name              TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  role              TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'editor', 'admin')),
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  email_verified_at TEXT,
  avatar_file_id    TEXT REFERENCES files(id) ON DELETE SET NULL,
  bio               TEXT CHECK (bio IS NULL OR length(bio) <= 500),
  language          TEXT NOT NULL DEFAULT 'en',
  theme             TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),
  preferences       TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(preferences)),
  last_login_at     TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_created ON users(created_at);

-- Session id stored is SHA-256 of the cookie token, so a DB leak can't hijack sessions.
CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token  TEXT NOT NULL,
  remember    INTEGER NOT NULL DEFAULT 0,
  ip          TEXT,
  user_agent  TEXT,
  expires_at  TEXT NOT NULL,
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- One-time tokens for email verification and password reset (hashed).
CREATE TABLE auth_tokens (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('verify_email', 'reset_password')),
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TEXT NOT NULL,
  used_at     TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_auth_tokens_user ON auth_tokens(user_id, type);

-- ── Files (all uploads: avatars, gallery, covers, documents, chat attachments) ──
CREATE TABLE files (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
  purpose       TEXT NOT NULL CHECK (purpose IN ('avatar', 'gallery', 'book_cover', 'book_document', 'education', 'chat', 'branding')),
  storage_key   TEXT NOT NULL UNIQUE,
  mime_type     TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL CHECK (size_bytes > 0),
  width         INTEGER,
  height        INTEGER,
  original_name TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_files_owner ON files(owner_id, purpose);

-- ── AI conversations ─────────────────────────────────────────────────
CREATE TABLE conversations (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL DEFAULT 'New conversation' CHECK (length(title) <= 120),
  model_tier      TEXT NOT NULL DEFAULT 'balanced' CHECK (model_tier IN ('fast', 'balanced', 'advanced')),
  pinned          INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
  favorite        INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1)),
  last_message_at TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_conversations_user ON conversations(user_id, pinned DESC, updated_at DESC);

CREATE TABLE messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content         TEXT NOT NULL DEFAULT '',
  attachments     TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(attachments)),
  status          TEXT NOT NULL DEFAULT 'complete' CHECK (status IN ('complete', 'streaming', 'stopped', 'error')),
  error_code      TEXT,
  model           TEXT,
  tokens_in       INTEGER,
  tokens_out      INTEGER,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);

-- ── Content: categories, books, gallery, education ───────────────────
CREATE TABLE categories (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL CHECK (type IN ('book', 'gallery', 'education')),
  name        TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  slug        TEXT NOT NULL,
  description TEXT,
  icon        TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (type, slug)
);

CREATE TABLE books (
  id               TEXT PRIMARY KEY,
  title            TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  author           TEXT NOT NULL,
  description      TEXT,
  category_id      TEXT REFERENCES categories(id) ON DELETE SET NULL,
  cover_file_id    TEXT REFERENCES files(id) ON DELETE SET NULL,
  document_file_id TEXT REFERENCES files(id) ON DELETE SET NULL,
  external_url     TEXT,
  license          TEXT NOT NULL DEFAULT 'unspecified',
  language         TEXT NOT NULL DEFAULT 'en',
  pages            INTEGER CHECK (pages IS NULL OR pages > 0),
  featured         INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
  published        INTEGER NOT NULL DEFAULT 1 CHECK (published IN (0, 1)),
  created_by       TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_books_category ON books(category_id, published);
CREATE INDEX idx_books_featured ON books(featured, published);

CREATE TABLE gallery_items (
  id             TEXT PRIMARY KEY,
  title          TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 140),
  description    TEXT,
  alt_text       TEXT NOT NULL,
  category_id    TEXT REFERENCES categories(id) ON DELETE SET NULL,
  file_id        TEXT NOT NULL REFERENCES files(id) ON DELETE RESTRICT,
  allow_download INTEGER NOT NULL DEFAULT 1 CHECK (allow_download IN (0, 1)),
  published      INTEGER NOT NULL DEFAULT 1 CHECK (published IN (0, 1)),
  uploaded_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_gallery_category ON gallery_items(category_id, published, created_at DESC);

CREATE TABLE education_resources (
  id          TEXT PRIMARY KEY,
  subject     TEXT NOT NULL,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  title       TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  summary     TEXT,
  body        TEXT,
  kind        TEXT NOT NULL DEFAULT 'note' CHECK (kind IN ('note', 'guide', 'quiz', 'link', 'video')),
  level       TEXT NOT NULL DEFAULT 'beginner' CHECK (level IN ('beginner', 'intermediate', 'advanced')),
  url         TEXT,
  file_id     TEXT REFERENCES files(id) ON DELETE SET NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  published   INTEGER NOT NULL DEFAULT 1 CHECK (published IN (0, 1)),
  views       INTEGER NOT NULL DEFAULT 0,
  created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_education_subject ON education_resources(subject, published, sort_order);

-- ── Favorites & bookmarks ────────────────────────────────────────────
CREATE TABLE favorites (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type  TEXT NOT NULL CHECK (item_type IN ('book', 'gallery', 'education')),
  item_id    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, item_type, item_id)
);
CREATE INDEX idx_favorites_item ON favorites(item_type, item_id);

CREATE TABLE bookmarks (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id    TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  page       INTEGER CHECK (page IS NULL OR page > 0),
  note       TEXT CHECK (note IS NULL OR length(note) <= 1000),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_bookmarks_user ON bookmarks(user_id, book_id);

-- ── Notifications & announcements ────────────────────────────────────
CREATE TABLE notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('system', 'account', 'resource', 'announcement')),
  title      TEXT NOT NULL,
  body       TEXT,
  link       TEXT,
  read_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_notifications_user ON notifications(user_id, read_at, created_at DESC);

CREATE TABLE announcements (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  body       TEXT,
  tone       TEXT NOT NULL DEFAULT 'info' CHECK (tone IN ('info', 'success', 'warning')),
  active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  starts_at  TEXT,
  ends_at    TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ── Contact form ─────────────────────────────────────────────────────
CREATE TABLE contact_messages (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  subject    TEXT NOT NULL,
  message    TEXT NOT NULL CHECK (length(message) <= 5000),
  status     TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'archived')),
  user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_contact_status ON contact_messages(status, created_at DESC);

-- ── AI configuration (managed from Admin → AI Settings) ─────────────
-- API keys are AES-256-GCM encrypted with ENCRYPTION_KEY; only last 4 chars kept in clear.
CREATE TABLE ai_providers (
  id          TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  provider    TEXT NOT NULL CHECK (provider IN ('anthropic', 'openai', 'gemini', 'openai-compatible')),
  base_url    TEXT,
  api_key_enc TEXT NOT NULL,
  key_last4   TEXT NOT NULL,
  models      TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(models)),  -- {"fast": "...", "balanced": "...", "advanced": "..."}
  is_active   INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
  last_test_at TEXT,
  last_test_ok INTEGER,
  created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
-- At most one active provider.
CREATE UNIQUE INDEX idx_ai_providers_one_active ON ai_providers(is_active) WHERE is_active = 1;

-- Optional per-user keys ("bring your own key"), when enabled by admin.
CREATE TABLE user_ai_keys (
  user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  provider    TEXT NOT NULL CHECK (provider IN ('anthropic', 'openai', 'gemini', 'openai-compatible')),
  base_url    TEXT,
  api_key_enc TEXT NOT NULL,
  key_last4   TEXT NOT NULL,
  model       TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE ai_usage (
  id              TEXT PRIMARY KEY,
  user_id         TEXT REFERENCES users(id) ON DELETE SET NULL,
  conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  feature         TEXT NOT NULL DEFAULT 'chat',   -- chat | explain | summarize | quiz | flashcards | plan | code | writing | translate
  provider        TEXT NOT NULL,
  model           TEXT NOT NULL,
  key_source      TEXT NOT NULL DEFAULT 'platform' CHECK (key_source IN ('platform', 'user')),
  tokens_in       INTEGER NOT NULL DEFAULT 0,
  tokens_out      INTEGER NOT NULL DEFAULT 0,
  latency_ms      INTEGER,
  status          TEXT NOT NULL CHECK (status IN ('ok', 'error', 'stopped')),
  error_code      TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_ai_usage_created ON ai_usage(created_at);
CREATE INDEX idx_ai_usage_user ON ai_usage(user_id, created_at);

-- ── Site settings (key/value JSON) & audit log ───────────────────────
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL CHECK (json_valid(value)),
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE admin_logs (
  id          TEXT PRIMARY KEY,
  actor_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  meta        TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(meta)),
  ip          TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_admin_logs_created ON admin_logs(created_at DESC);
CREATE INDEX idx_admin_logs_actor ON admin_logs(actor_id);

-- ── Full-text search index (books, education, gallery, pages) ────────
CREATE VIRTUAL TABLE search_index USING fts5(
  item_type UNINDEXED,
  item_id UNINDEXED,
  title,
  body,
  tokenize = 'unicode61 remove_diacritics 2'
);

-- Conversation search (per-user, filtered by user_id at query time).
CREATE VIRTUAL TABLE conversation_search USING fts5(
  conversation_id UNINDEXED,
  user_id UNINDEXED,
  content,
  tokenize = 'unicode61 remove_diacritics 2'
);
