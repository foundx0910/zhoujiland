-- 由 scripts/gen-schema.mjs 从 core/schema.js 生成，请勿手改
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user',
  banned        INTEGER NOT NULL DEFAULT 0,
  default_pw    INTEGER NOT NULL DEFAULT 0,
  bio           TEXT NOT NULL DEFAULT '',
  avatar        TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS boards (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  owner_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  owner_name  TEXT NOT NULL DEFAULT '',
  deleted     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS threads (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id      INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  author_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  author_name   TEXT NOT NULL,
  author_type   TEXT NOT NULL DEFAULT 'guest',
  actor_key     TEXT NOT NULL DEFAULT '',
  pinned        INTEGER NOT NULL DEFAULT 0,
  locked        INTEGER NOT NULL DEFAULT 0,
  views         INTEGER NOT NULL DEFAULT 0,
  floor_count   INTEGER NOT NULL DEFAULT 0,
  reply_count   INTEGER NOT NULL DEFAULT 0,
  last_reply_at TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  deleted       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS posts (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id      INTEGER NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  floor_no       INTEGER,
  parent_id      INTEGER REFERENCES posts(id) ON DELETE CASCADE,
  quote_floor_no INTEGER,
  quote_author   TEXT,
  author_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  author_name    TEXT NOT NULL,
  author_type    TEXT NOT NULL DEFAULT 'guest',
  actor_key      TEXT NOT NULL DEFAULT '',
  content        TEXT NOT NULL,
  likes          INTEGER NOT NULL DEFAULT 0,
  deleted        INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS likes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type TEXT NOT NULL,
  target_id   INTEGER NOT NULL,
  actor_key   TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  UNIQUE (target_type, target_id, actor_key)
);

CREATE INDEX IF NOT EXISTS idx_threads_board ON threads (board_id, pinned DESC, last_reply_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_thread  ON posts (thread_id, floor_no);
CREATE INDEX IF NOT EXISTS idx_posts_parent  ON posts (parent_id);
CREATE INDEX IF NOT EXISTS idx_likes_actor   ON likes (actor_key, target_type, target_id);

-- 消息通知：被回复 / 被引用 / 被点赞 / 被 @
CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  actor_name TEXT NOT NULL DEFAULT '',
  thread_id  INTEGER,
  post_id    INTEGER,
  board_slug TEXT NOT NULL DEFAULT '',
  title      TEXT NOT NULL DEFAULT '',
  excerpt    TEXT NOT NULL DEFAULT '',
  read       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications (user_id, read, id DESC);

-- 板块版主
CREATE TABLE IF NOT EXISTS board_moderators (
  board_id   INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (board_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_mod_user ON board_moderators (user_id);

-- 举报
CREATE TABLE IF NOT EXISTS reports (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type   TEXT NOT NULL,
  target_id     INTEGER NOT NULL,
  thread_id     INTEGER,
  board_id      INTEGER,
  reporter_key  TEXT NOT NULL DEFAULT '',
  reporter_name TEXT NOT NULL DEFAULT '',
  reason        TEXT NOT NULL,
  detail        TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'open',
  handled_by    TEXT NOT NULL DEFAULT '',
  handled_at    TEXT,
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON reports (status, id DESC);
CREATE INDEX IF NOT EXISTS idx_reports_board  ON reports (board_id, status);
