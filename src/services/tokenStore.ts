import crypto from "crypto";
import db from "./db.js";

/**
 * DB-backed bearer token store, shared by:
 *  - the OAuth provider (Claude's dynamically-registered client)
 *  - the static token minting script (Gemini, or any non-OAuth caller)
 *  - the REST facade's auth middleware
 *
 * Tokens are stored as sha256 hashes -- the plaintext token is only ever
 * shown once, at mint time, and never persisted or logged again.
 *
 * Revocation is per client_label: revoking "gemini" does not touch
 * "claude" or any other label's tokens, and does not require a restart.
 */

interface TokenRecord {
  clientLabel: string;
  expiresAt: number;
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Sentinel for "no expiry" -- 9999-12-31T23:59:59Z. Deliberately not using
// NULL/Infinity so expires_at stays a plain comparable integer everywhere
// (verifyToken's "< now" check needs no special-casing for this).
export const NEVER_EXPIRES = 253402300799;

export function issueToken(clientLabel: string, expiresInSeconds: number): { token: string; expiresAt: number } {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = expiresInSeconds >= NEVER_EXPIRES
    ? NEVER_EXPIRES
    : Math.floor(Date.now() / 1000) + expiresInSeconds;

  db.prepare(
    `INSERT INTO oauth_tokens (token_hash, client_label, issued_at, expires_at) VALUES (?, ?, ?, ?)`
  ).run(hashToken(token), clientLabel, new Date().toISOString(), expiresAt);

  return { token, expiresAt };
}

export function verifyToken(token: string): TokenRecord | null {
  const row = db
    .prepare(
      `SELECT client_label, expires_at FROM oauth_tokens
       WHERE token_hash = ? AND revoked_at IS NULL`
    )
    .get(hashToken(token)) as { client_label: string; expires_at: number } | undefined;

  if (!row) return null;
  if (row.expires_at < Math.floor(Date.now() / 1000)) return null;

  return { clientLabel: row.client_label, expiresAt: row.expires_at };
}

/** Revokes every live token for a client label. Returns how many were revoked. */
export function revokeClient(clientLabel: string): number {
  const result = db
    .prepare(`UPDATE oauth_tokens SET revoked_at = ? WHERE client_label = ? AND revoked_at IS NULL`)
    .run(new Date().toISOString(), clientLabel);
  return result.changes;
}

export interface ClientTokenSummary {
  clientLabel: string;
  issuedAt: string;
  expiresAt: number;
  revoked: boolean;
}

/** Lists every token (active and revoked) for visibility -- CLI/dashboard use. */
export function listTokens(): ClientTokenSummary[] {
  const rows = db
    .prepare(
      `SELECT client_label, issued_at, expires_at, revoked_at FROM oauth_tokens ORDER BY issued_at DESC`
    )
    .all() as Array<{ client_label: string; issued_at: string; expires_at: number; revoked_at: string | null }>;

  return rows.map((r) => ({
    clientLabel: r.client_label,
    issuedAt: r.issued_at,
    expiresAt: r.expires_at,
    revoked: r.revoked_at !== null,
  }));
}
