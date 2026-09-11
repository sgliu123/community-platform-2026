CREATE TABLE IF NOT EXISTS owners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    room_no TEXT UNIQUE NOT NULL,
    phone TEXT,
    id_card_last3 TEXT,
    area INTEGER NOT NULL,
    hash TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS polls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    poll_category INTEGER NOT NULL DEFAULT 1,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    options TEXT NOT NULL,
    attachments TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL,
    poll_id INTEGER NOT NULL,
    owner_id INTEGER NOT NULL,
    choice INTEGER NOT NULL,
    weight INTEGER NOT NULL DEFAULT 1,
    comment TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(uuid, poll_id),
    FOREIGN KEY (owner_id) REFERENCES owners(id),
    FOREIGN KEY (poll_id) REFERENCES polls(id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    detail TEXT,
    operator TEXT,
    ip TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);
