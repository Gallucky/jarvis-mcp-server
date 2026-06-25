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
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";

import { ObsidianClient } from "./services/obsidianClient.js";
import { makeOAuthProvider, registerAuthorizeApproveRoute } from "./services/oauthProvider.js";
import { registerVaultTools } from "./tools/vault.js";
import { registerJarvisTools } from "./tools/jarvis.js";
import { registerSqliteTools } from "./tools/sqlite.js";
import { registerFilesystemTools } from "./tools/filesystem.js";
import { registerVaultMemorySyncTools } from "./tools/vaultMemorySync.js";
import { registerObsidianSkillTools } from "./tools/obsidian.js";
import { readFileSync } from "fs";
import { dirname, join } from "path/win32";
import { fileURLToPath } from "url";
import db from "./services/db.js";
import { registerStudyTools } from "./tools/study/psychometric.js";
import dashboardRouter from "./routes/dashboard.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf-8")) as { version: string };

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`ERROR: ${name} is required. See .env.example.`);
    process.exit(1);
  }
  return value;
}

function buildServer(obsidian: ObsidianClient): McpServer {
  const server = new McpServer({ name: "jarvis-mcp-server", version: pkg.version });
  registerVaultTools(server, obsidian);
  registerJarvisTools(server, obsidian);
  registerSqliteTools(server);
  registerFilesystemTools(server);
  registerStudyTools(server, db);
  registerVaultMemorySyncTools(server, obsidian);
  registerObsidianSkillTools(server);
  return server;
}

async function runStdio(obsidian: ObsidianClient): Promise<void> {
  const server = buildServer(obsidian);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("jarvis-mcp-server running via stdio");
}

function logRequests(label: string) {
  return (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    console.error(`[${label}] ${req.method} ${req.path}`);
    next();
  };
}

// Claude's web client calls /mcp cross-origin, so it preflights with OPTIONS --
// requireBearerAuth has no CORS awareness and would 401 a preflight (which never
// carries an Authorization header), so the browser blocks the real request before
// OAuth even gets a chance to run. Short-circuit OPTIONS here, ahead of auth.
function allowCrossOriginMcpClients(req: express.Request, res: express.Response, next: express.NextFunction): void {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "*");
  // Reflect whatever headers this specific preflight asked for, instead of a
  // hardcoded list -- avoids silently blocking a client that sends a header
  // we didn't anticipate (e.g. a protocol-version header).
  const requestedHeaders = req.header("Access-Control-Request-Headers");
  res.header("Access-Control-Allow-Headers", requestedHeaders ?? "*");
  res.header("Access-Control-Expose-Headers", "*");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
}

function mountStaticAssets(app: express.Express): void {
  app.get("/favicon.ico", (_req, res) => {
    res.setHeader("Content-Type", "image/svg+xml");
    res.send(readFileSync(join(__dirname, "../public/favicon.svg")));
  });
  app.use(express.static(join(__dirname, "../public")));
}

/**
 * MCP/OAuth gets its own port so it alone can be exposed via Tailscale Funnel
 * (internet-reachable, gated by the password prompt in oauthProvider.ts).
 * The dashboard runs on a separate port kept on plain Tailscale Serve
 * (tailnet-only, no password needed -- see runDashboard).
 */
async function runMcp(obsidian: ObsidianClient): Promise<void> {
  requireEnv("AUTH_APPROVAL_PASSWORD");
  const port = parseInt(process.env.PORT ?? "3701", 10);
  const baseUrl = new URL(
    (process.env.PUBLIC_BASE_URL ?? `http://localhost:${port}`).replace(/\/$/, "")
  );

  const provider = makeOAuthProvider();

  const app = express();
  app.set("trust proxy", 1); // for Tailscale HTTPS reverse proxy
  app.use(logRequests("mcp"));
  app.use(allowCrossOriginMcpClients);
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  registerAuthorizeApproveRoute(app);

  // favicon so Claude's connector UI shows an icon
  mountStaticAssets(app);

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
    console.error(`jarvis-mcp-server (MCP) listening on http://127.0.0.1:${port}/mcp`);
    console.error(`OAuth issuer: ${baseUrl.toString()}`);
    console.error(`Resource metadata: ${resourceMetadataUrl}`);
  });
}

function runDashboard(): void {
  const port = parseInt(process.env.DASHBOARD_PORT ?? "3700", 10);

  const app = express();
  app.set("trust proxy", 1);
  app.use(logRequests("dashboard"));
  app.use(dashboardRouter);
  mountStaticAssets(app);

  app.listen(port, "127.0.0.1", () => {
    console.error(`jarvis-mcp-server (dashboard) listening on http://127.0.0.1:${port}/dashboard`);
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
    await runMcp(obsidian);
    runDashboard();
  } else {
    await runStdio(obsidian);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
