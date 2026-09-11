-- poll-demo V7.1 最终版建表
-- 面积单位：0.01 平方米（整数存储，消除浮点误差）
-- 用法：wrangler d1 execute poll-db --file=schema.sql

CREATE TABLE IF NOT EXISTS owner_identity (
  uuid         TEXT PRIMARY KEY,
  hash_digest  TEXT NOT NULL,
  name         TEXT,                -- 业主姓名（可选，仅本地核对用，建议长期不入库）
  room_no      TEXT,                -- 房号
  has_voted    INTEGER NOT NULL DEFAULT 0,
  area_cents   INTEGER NOT NULL DEFAULT 0,  -- 专有部分产权面积 ×100
  import_batch TEXT,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_hash  ON owner_identity(hash_digest);
CREATE INDEX IF NOT EXISTS idx_batch ON owner_identity(import_batch);
CREATE INDEX IF NOT EXISTS idx_room  ON owner_identity(room_no);

CREATE TABLE IF NOT EXISTS vote_records (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid          TEXT NOT NULL,
  poll_id       TEXT NOT NULL DEFAULT 'single_poll',
  vote_content  TEXT NOT NULL,       -- 赞成 / 反对 / 弃权
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(uuid, poll_id),             -- 防重复最终闸
  FOREIGN KEY(uuid) REFERENCES owner_identity(uuid)
);
CREATE INDEX IF NOT EXISTS idx_vote_uuid ON vote_records(uuid);
CREATE INDEX IF NOT EXISTS idx_vote_poll ON vote_records(poll_id);

CREATE TABLE IF NOT EXISTS attachments (
  key          TEXT PRIMARY KEY,
  uuid         TEXT NOT NULL,
  poll_id      TEXT NOT NULL DEFAULT 'single_poll',
  content_type TEXT,
  size         INTEGER,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(uuid) REFERENCES owner_identity(uuid)
);
CREATE INDEX IF NOT EXISTS idx_attach_uuid ON attachments(uuid);

CREATE TABLE IF NOT EXISTS audit_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid       TEXT,
  admin_user TEXT,
  action     TEXT NOT NULL,
  detail     TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_uuid ON audit_logs(uuid);

CREATE TABLE IF NOT EXISTS poll_config (
  poll_id     TEXT PRIMARY KEY DEFAULT 'single_poll',
  title       TEXT NOT NULL DEFAULT '当前投票',
  description TEXT,
  start_time  TIMESTAMP,
  end_time    TIMESTAMP,
  category    INTEGER NOT NULL DEFAULT 1,   -- 民法典第278条 第1~9项
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO poll_config (poll_id, title, category) VALUES ('single_poll', '首次投票', 1);

CREATE TABLE IF NOT EXISTS system_config (
  config_key TEXT PRIMARY KEY,
  config_value TEXT
);

INSERT OR IGNORE INTO system_config (config_key, config_value) VALUES ('verify_mode', 'ledger');
INSERT OR IGNORE INTO system_config (config_key, config_value) VALUES ('batch_size', '50');
