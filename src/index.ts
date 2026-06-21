#!/usr/bin/env node
/**
 * jarvis-mcp-server
 *
 * Wraps the Obsidian Local REST API plugin (running on this machine) and
 * exposes it as a remote MCP server, so any Claude client -- mobile, web,
 * desktop -- can read/write your vault, not just devices running Obsidian
 * locally.
 */

import "dotenv/config";
import crypto from "crypto";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import type { OAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type {
  OAuthClientInformationFull,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { Response } from "express";

import { ObsidianClient } from "./services/obsidianClient.js";
import { registerVaultTools } from "./tools/vault.js";
import { registerJarvisTools } from "./tools/jarvis.js";
import { registerSqliteTools } from "./tools/sqlite.js";
import { registerFilesystemTools } from "./tools/filesystem.js";
import { readFileSync } from "fs";
import { dirname, join } from "path/win32";
import { fileURLToPath } from "url";

// ---------------------------------------------------------------------------
// In-memory OAuth stores (personal server -- resets on restart, fine)
// ---------------------------------------------------------------------------
interface StoredCode {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  expiresAt: number;
}
interface StoredToken {
  clientId: string;
  scopes: string[];
  expiresAt: number;
}

const clients = new Map<string, OAuthClientInformationFull>();
const codes = new Map<string, StoredCode>();
const tokens = new Map<string, StoredToken>();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`ERROR: ${name} is required. See .env.example.`);
    process.exit(1);
  }
  return value;
}

function buildServer(obsidian: ObsidianClient): McpServer {
  const server = new McpServer({ name: "jarvis-mcp-server", version: "1.0.0" });
  registerVaultTools(server, obsidian);
  registerJarvisTools(server, obsidian);
  registerSqliteTools(server);
  registerFilesystemTools(server);
  return server;
}

async function runStdio(obsidian: ObsidianClient): Promise<void> {
  const server = buildServer(obsidian);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("jarvis-mcp-server running via stdio");
}

// ---------------------------------------------------------------------------
// OAuth provider -- auto-approves everything (Tailscale is the real gate)
// ---------------------------------------------------------------------------
function makeProvider(): OAuthServerProvider {
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

  const provider: OAuthServerProvider = {
    get clientsStore() {
      return clientsStore;
    },

    async authorize(
      _client: OAuthClientInformationFull,
      params: { state?: string; codeChallenge: string; redirectUri: string },
      res: Response
    ) {
      const code = crypto.randomBytes(16).toString("hex");
      codes.set(code, {
        clientId: _client.client_id,
        redirectUri: params.redirectUri,
        codeChallenge: params.codeChallenge,
        expiresAt: Date.now() + 5 * 60 * 1000,
      });
      const dest = new URL(params.redirectUri);
      dest.searchParams.set("code", code);
      if (params.state) dest.searchParams.set("state", params.state);
      console.error(`OAuth: authorizing client ${_client.client_id}, redirecting to ${dest.toString()}`);
      res.redirect(dest.toString());
    },

    async challengeForAuthorizationCode(
      _client: OAuthClientInformationFull,
      authorizationCode: string
    ) {
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

      const accessToken = crypto.randomBytes(32).toString("hex");
      const ONE_YEAR = 365 * 24 * 60 * 60;
      tokens.set(accessToken, {
        clientId: record.clientId,
        scopes: [],
        expiresAt: Math.floor(Date.now() / 1000) + ONE_YEAR,
      });
      console.error(`OAuth: token issued for client ${record.clientId}`);
      return { access_token: accessToken, token_type: "Bearer", expires_in: ONE_YEAR };
    },

    async exchangeRefreshToken(): Promise<OAuthTokens> {
      throw new Error("Refresh tokens not supported");
    },

    async verifyAccessToken(token: string): Promise<AuthInfo> {
      const record = tokens.get(token);
      if (!record) throw new Error("Invalid token");
      if (record.expiresAt < Math.floor(Date.now() / 1000)) throw new Error("Token expired");
      return {
        token,
        clientId: record.clientId,
        scopes: record.scopes,
        expiresAt: record.expiresAt,
      };
    },
  };

  return provider;
}

async function runHTTP(obsidian: ObsidianClient): Promise<void> {
  const port = parseInt(process.env.PORT ?? "3700", 10);
  const baseUrl = new URL(
    (process.env.PUBLIC_BASE_URL ?? `http://localhost:${port}`).replace(/\/$/, "")
  );

  const provider = makeProvider();

  const app = express();
  app.set("trust proxy", 1); // for Tailscale HTTPS reverse proxy

  // Log all incoming requests for debugging
  app.use((req, _res, next) => {
    console.error(`${req.method} ${req.path}`);
    next();
  });

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // serve favicon so Claude's connector UI shows an icon
  const __dirname = dirname(fileURLToPath(import.meta.url));
  app.get("/favicon.ico", (_req, res) => {
    res.setHeader("Content-Type", "image/svg+xml");
    res.send(readFileSync(join(__dirname, "../public/favicon.svg")));
  });


  // SDK OAuth router (sets up /.well-known/*, /register, /authorize, /token)
  app.use(mcpAuthRouter({ provider, issuerUrl: baseUrl }));

  // Protect /mcp and /health -- include resourceMetadataUrl so Claude
  // can discover the OAuth server from the WWW-Authenticate header on 401
  const resourceMetadataUrl = `${baseUrl.origin}/.well-known/oauth-protected-resource`;
  const verifier = { verifyAccessToken: (t: string) => provider.verifyAccessToken(t) };
  app.use(["/mcp", "/health"], requireBearerAuth({ verifier, resourceMetadataUrl }));

  app.get("/health", async (_req, res) => {
    const obsidianReachable = await obsidian.ping();
    res.json({ status: "ok", obsidian_reachable: obsidianReachable });
  });

  app.post("/mcp", async (req, res) => {
    const server = buildServer(obsidian);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.listen(port, "127.0.0.1", () => {
    console.error(`jarvis-mcp-server listening on http://127.0.0.1:${port}/mcp`);
    console.error(`OAuth issuer: ${baseUrl.toString()}`);
    console.error(`Resource metadata: ${resourceMetadataUrl}`);
  });
}

async function main(): Promise<void> {
  const obsidianBaseUrl = requireEnv("OBSIDIAN_API_BASE_URL");
  const obsidianApiKey = requireEnv("OBSIDIAN_API_KEY");
  const obsidian = new ObsidianClient(obsidianBaseUrl, obsidianApiKey);

  const reachable = await obsidian.ping();
  if (!reachable) {
    console.error(
      "WARNING: Could not reach Obsidian Local REST API at startup. " +
      "Make sure Obsidian is open with the Local REST API HTTP server enabled. " +
      "Starting anyway -- tools will fail until Obsidian is reachable."
    );
  }

  const transport = process.env.TRANSPORT ?? "stdio";
  if (transport === "http") {
    await runHTTP(obsidian);
  } else {
    await runStdio(obsidian);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
