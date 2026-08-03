// Mints a long-lived Bearer token for a non-OAuth caller (e.g. Gemini/AI Studio,
// which calls the REST facade as plain HTTP and can't do the OAuth/PKCE dance
// Claude's client does). The token is printed once and never stored in
// plaintext -- only its sha256 hash lives in the DB (see tokenStore.ts).
//
// Usage: npm run mint-token -- <label> [days|never]
//   label: required, identifies this caller for revocation (e.g. "gemini")
//   days:  optional, defaults to 365. Pass "never" for no expiry at all --
//          revocation (npm run revoke-token) is still how you cut it off.
import { issueToken, NEVER_EXPIRES } from "../services/tokenStore.js";

const [label, lifetimeArg] = process.argv.slice(2);

if (!label) {
  console.error("Usage: npm run mint-token -- <label> [days|never]");
  console.error('Examples: npm run mint-token -- gemini 365');
  console.error('          npm run mint-token -- gemini never');
  process.exit(1);
}

const expiresInSeconds = lifetimeArg === "never"
  ? NEVER_EXPIRES
  : (lifetimeArg ? parseInt(lifetimeArg, 10) : 365) * 24 * 60 * 60;

const { token, expiresAt } = issueToken(label, expiresInSeconds);
const expiryLabel = expiresAt === NEVER_EXPIRES ? "never" : new Date(expiresAt * 1000).toISOString();

console.log(`Token minted for client "${label}", expires: ${expiryLabel}.`);
console.log("");
console.log(token);
console.log("");
console.log("This is shown once -- store it in Gemini's tool config now (Authorization: Bearer <token>).");
console.log(`Revoke later with: npm run revoke-token -- ${label}`);
