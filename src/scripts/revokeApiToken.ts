// Revokes every live token for one client label -- e.g. cut off Gemini
// without touching Claude's tokens or restarting the server.
//
// Usage: npm run revoke-token -- gemini
import { revokeClient } from "../services/tokenStore.js";

const [label] = process.argv.slice(2);

if (!label) {
  console.error("Usage: npm run revoke-token -- <label>");
  process.exit(1);
}

const count = revokeClient(label);
console.log(count > 0
  ? `Revoked ${count} token(s) for client "${label}".`
  : `No live tokens found for client "${label}".`);
