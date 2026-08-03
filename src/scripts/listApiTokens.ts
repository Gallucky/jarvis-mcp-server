// Lists every issued token (Claude's OAuth-issued ones and any static ones
// minted for Gemini etc.) with status, so you can see who currently has
// access before deciding what to revoke.
//
// Usage: npm run list-tokens
import { listTokens, NEVER_EXPIRES } from "../services/tokenStore.js";

const tokens = listTokens();

if (tokens.length === 0) {
  console.log("No tokens issued yet.");
  process.exit(0);
}

for (const t of tokens) {
  const status = t.revoked ? "REVOKED" : (t.expiresAt < Math.floor(Date.now() / 1000) ? "EXPIRED" : "active");
  const expiry = t.expiresAt === NEVER_EXPIRES ? "never" : new Date(t.expiresAt * 1000).toISOString();
  console.log(`${t.clientLabel.padEnd(24)} ${status.padEnd(8)} issued ${t.issuedAt}  expires ${expiry}`);
}
