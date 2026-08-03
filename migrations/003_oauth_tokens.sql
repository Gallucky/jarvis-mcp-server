-- DB-backed access tokens, replacing the old in-memory Map. Survives restarts
-- and enables per-client revoke: kill one caller's access (e.g. "gemini")
-- without touching anyone else's token or restarting the server.
--
-- token_hash stores sha256(token), never the raw token -- a DB read/leak
-- doesn't hand over live credentials.
CREATE TABLE IF NOT EXISTS oauth_tokens (
  token_hash    TEXT PRIMARY KEY,
  client_label  TEXT NOT NULL,
  issued_at     TEXT NOT NULL,
  expires_at    INTEGER NOT NULL,
  revoked_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_oauth_tokens_client_label ON oauth_tokens (client_label);
