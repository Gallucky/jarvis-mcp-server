-- migrations/002_tasks.sql
CREATE TABLE IF NOT EXISTS tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,
  description TEXT,
  status      TEXT    NOT NULL DEFAULT 'Not Started'
                CHECK(status IN ('Not Started','WIP','Struggling','Near Complete','Completed','Archived')),
  priority    TEXT    NOT NULL DEFAULT 'Medium'
                CHECK(priority IN ('Low','Medium','High')),
  area        TEXT,
  due_date    TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);