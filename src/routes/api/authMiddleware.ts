import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../../services/tokenStore.js";

// Augment Express's Request so downstream handlers can read who called.
declare module "express-serve-static-core" {
  interface Request {
    apiClientLabel?: string;
  }
}

/**
 * Bearer-token auth for the REST facade (/api/*). Independent of the MCP
 * OAuth flow -- this is for callers like Gemini that speak plain HTTP and
 * can't do the OAuth/PKCE dance, using a token minted via
 * `npm run mint-token`. Checked against the same DB-backed tokenStore used
 * by the OAuth provider, so revocation (`npm run revoke-token`) works the
 * same way regardless of how the token was issued.
 */
export function requireApiToken(req: Request, res: Response, next: NextFunction): void {
  const header = req.header("Authorization");
  const token = header?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!token) {
    res.status(401).json({ error: "Missing Authorization: Bearer <token> header." });
    return;
  }

  const record = verifyToken(token);
  if (!record) {
    res.status(401).json({ error: "Invalid, expired, or revoked token." });
    return;
  }

  req.apiClientLabel = record.clientLabel;
  next();
}
