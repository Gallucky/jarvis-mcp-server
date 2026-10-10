import crypto from "crypto";
import type { Express, Request, Response } from "express";
import type { OAuthServerProvider, AuthorizationParams } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { OAuthClientInformationFull, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import { issueToken, verifyToken } from "./tokenStore.js";

/**
 * Clients and in-flight authorization codes stay in-memory -- personal
 * server, resets on restart by design, and codes are single-use/5-minute-lived
 * anyway. Issued access tokens live in the DB-backed tokenStore instead (see
 * ./tokenStore.ts), so they survive restarts and can be revoked per client
 * label without affecting other callers.
 *
 * The only thing that actually gates a stranger from getting a token is the
 * password prompt in /authorize-approve below, NOT network placement --
 * this server may be reachable from the public internet via Tailscale Funnel.
 */
interface StoredCode {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  expiresAt: number;
}

const clients = new Map<string, OAuthClientInformationFull>();
const codes = new Map<string, StoredCode>();

/**
 * Only these redirect URIs may ever receive an authorization code. Applies to
 * dynamically registered clients too, so a stranger cannot register their own
 * redirect_uri and phish the approval password. Add a URI here only if the
 * connector genuinely needs it.
 */
const ALLOWED_REDIRECTS = new Set(["https://claude.ai/api/mcp/auth_callback"]);

/**
 * Global (not per-IP) limit on failed password attempts. Per-IP would be
 * spoofable behind the Funnel proxy with `trust proxy: true`. Trade-off: someone
 * can lock out *new* approvals for the window by spamming guesses; tokens that
 * are already issued keep working.
 */
const MAX_FAILED_ATTEMPTS = 10;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const failedAttempts: number[] = [];

function tooManyAttempts(): boolean {
  const cutoff = Date.now() - ATTEMPT_WINDOW_MS;
  while (failedAttempts.length && failedAttempts[0]! < cutoff) failedAttempts.shift();
  return failedAttempts.length >= MAX_FAILED_ATTEMPTS;
}

function recordFailedAttempt(): void {
  failedAttempts.push(Date.now());
}

export function makeOAuthProvider(): OAuthServerProvider {
  const staticId = process.env["OAUTH_CLIENT_ID"];
  const staticSecret = process.env["OAUTH_CLIENT_SECRET"];
  if (staticId && staticSecret) {
    clients.set(staticId, {
      client_id: staticId,
      client_secret: staticSecret,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_post",
    });
    console.error(`OAuth: static client pre-registered (${staticId})`);
  }

  const clientsStore: OAuthRegisteredClientsStore = {
    getClient(clientId: string) {
      return clients.get(clientId);
    },
    registerClient(info) {
      const redirectUris = (info.redirect_uris ?? []).map((u) => String(u));
      if (redirectUris.length === 0 || !redirectUris.every((u) => ALLOWED_REDIRECTS.has(u))) {
        console.error(`OAuth: rejected dynamic registration with redirect_uris=${JSON.stringify(redirectUris)}`);
        throw new Error("redirect_uri not allowed");
      }
      const clientId = crypto.randomBytes(16).toString("hex");
      const clientSecret = crypto.randomBytes(32).toString("hex");
      const full: OAuthClientInformationFull = {
        ...info,
        client_id: clientId,
        client_secret: clientSecret,
        client_id_issued_at: Math.floor(Date.now() / 1000),
      };
      clients.set(clientId, full);
      console.error(`OAuth: dynamic client registered (${clientId})`);
      return full;
    },
  };

  return {
    get clientsStore() {
      return clientsStore;
    },

    // Renders a password prompt instead of auto-issuing a code -- the actual
    // code is only issued from POST /authorize-approve after the password checks out.
    async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response) {
      res.send(
        renderApprovalForm({
          clientId: client.client_id,
          redirectUri: params.redirectUri,
          codeChallenge: params.codeChallenge,
          state: params.state,
        })
      );
    },

    async challengeForAuthorizationCode(_client: OAuthClientInformationFull, authorizationCode: string) {
      const record = codes.get(authorizationCode);
      if (!record || record.expiresAt < Date.now()) {
        throw new Error("Invalid or expired code");
      }
      return record.codeChallenge;
    },

    async exchangeAuthorizationCode(
      _client: OAuthClientInformationFull,
      authorizationCode: string
    ): Promise<OAuthTokens> {
      const record = codes.get(authorizationCode);
      if (!record || record.expiresAt < Date.now()) {
        throw new Error("Invalid or expired code");
      }
      codes.delete(authorizationCode);

      const ONE_YEAR = 365 * 24 * 60 * 60;
      const { token: accessToken, expiresAt } = issueToken(record.clientId, ONE_YEAR);
      console.error(`OAuth: token issued for client ${record.clientId}`);
      return { access_token: accessToken, token_type: "Bearer", expires_in: expiresAt - Math.floor(Date.now() / 1000) };
    },

    async exchangeRefreshToken(): Promise<OAuthTokens> {
      throw new Error("Refresh tokens not supported");
    },

    async verifyAccessToken(token: string): Promise<AuthInfo> {
      const record = verifyToken(token);
      if (!record) throw new Error("Invalid or expired token");
      return {
        token,
        clientId: record.clientLabel,
        scopes: [],
        expiresAt: record.expiresAt,
      };
    },
  };
}

/** Mounts the password-gated form submission that actually issues authorization codes. */
export function registerAuthorizeApproveRoute(app: Express): void {
  app.post("/authorize-approve", (req: Request, res: Response) => {
    const body = req.body ?? {};
    // Coerce everything to strings: a missing or non-string field must not crash the handler.
    const clientId = String(body.client_id ?? "");
    const redirectUri = String(body.redirect_uri ?? "");
    const codeChallenge = String(body.code_challenge ?? "");
    const state = body.state ? String(body.state) : undefined;
    const password = String(body.password ?? "");
    const formFields = { clientId, redirectUri, codeChallenge, state };

    if (tooManyAttempts()) {
      console.error("OAuth: approval blocked, too many failed attempts");
      res.status(429).send(renderApprovalForm({ ...formFields, error: "Too many attempts. Try again later." }));
      return;
    }

    const expectedPassword = process.env.AUTH_APPROVAL_PASSWORD;
    if (!expectedPassword || !passwordsMatch(password, expectedPassword)) {
      recordFailedAttempt();
      console.error("OAuth: failed approval attempt");
      res.status(401).send(renderApprovalForm({ ...formFields, error: "Incorrect password." }));
      return;
    }

    const client = clients.get(clientId);
    if (!client || !client.redirect_uris.includes(redirectUri) || !ALLOWED_REDIRECTS.has(redirectUri)) {
      res.status(400).send("Invalid client or redirect URI.");
      return;
    }

    const code = crypto.randomBytes(16).toString("hex");
    codes.set(code, {
      clientId,
      redirectUri,
      codeChallenge,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    const dest = new URL(redirectUri);
    dest.searchParams.set("code", code);
    if (state) dest.searchParams.set("state", state);
    // Never log the code itself.
    console.error(`OAuth: approved client ${clientId}, redirecting to ${dest.origin}${dest.pathname}`);
    res.redirect(dest.toString());
  });
}

function passwordsMatch(input: string, expected: string): boolean {
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function renderApprovalForm(opts: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state?: string;
  error?: string;
}): string {
  return `<!doctype html>
<html><body style="font-family: sans-serif; max-width: 400px; margin: 80px auto;">
  <h2>Approve MCP access</h2>
  ${opts.error ? `<p style="color:red;">${escapeHtml(opts.error)}</p>` : ""}
  <form method="post" action="/authorize-approve">
    <input type="hidden" name="client_id" value="${escapeHtml(opts.clientId)}" />
    <input type="hidden" name="redirect_uri" value="${escapeHtml(opts.redirectUri)}" />
    <input type="hidden" name="code_challenge" value="${escapeHtml(opts.codeChallenge)}" />
    ${opts.state ? `<input type="hidden" name="state" value="${escapeHtml(opts.state)}" />` : ""}
    <input type="password" name="password" placeholder="Approval password" autofocus
      style="width:100%;padding:8px;margin-bottom:8px;box-sizing:border-box;" />
    <button type="submit" style="width:100%;padding:8px;">Approve</button>
  </form>
</body></html>`;
}
