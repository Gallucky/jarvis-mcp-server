CREATE TABLE IF NOT EXISTS exercise_completions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  note_path     TEXT NOT NULL,
  lesson_number INTEGER,
  area          TEXT,
  section       TEXT,
  zone          TEXT,
  topic         TEXT,
  exercise_set  TEXT,
  completed     INTEGER NOT NULL CHECK (completed IN (0, 1)),
  url           TEXT,
  synced_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ec_section   ON exercise_completions (section);
CREATE INDEX IF NOT EXISTS idx_ec_topic     ON exercise_completions (topic);
CREATE INDEX IF NOT EXISTS idx_ec_completed ON exercise_completions (completed);