import { Router } from "express";
import type { ObsidianClient } from "../../services/obsidianClient.js";
import { requireApiToken } from "./authMiddleware.js";
import { buildVaultRouter } from "./vaultRoutes.js";
import { buildDbRouter } from "./dbRoutes.js";
import { buildObsidianRouter } from "./obsidianRoutes.js";
import { buildStudyRouter } from "./studyRoutes.js";
import { buildOpenApiRouter } from "./openapi.js";

/**
 * Plain-HTTP REST facade next to the MCP endpoint (/mcp), for callers that
 * don't speak MCP -- currently Gemini/AI Studio. Only a deliberately chosen
 * subset of tools is exposed here (see the security-plan conversation this
 * came from): vault CRUD/search, distillation, read-only DB access, study
 * sync, and the lower-risk obsidian file writers. Filesystem tools, raw SQL
 * execution, obsidian_cli, vault-memory sync, and Discord stay MCP-only.
 *
 * /api/openapi.json is intentionally NOT behind requireApiToken -- Gemini
 * needs to fetch the schema before it has anywhere to put a token, and the
 * schema itself reveals no secrets (see openapi.ts).
 */
export function buildApiRouter(obsidian: ObsidianClient, baseUrl: string): Router {
  const router = Router();

  router.use(buildOpenApiRouter(baseUrl));
  router.use(requireApiToken);
  router.use(buildVaultRouter(obsidian));
  router.use(buildDbRouter());
  router.use(buildObsidianRouter());
  router.use(buildStudyRouter());

  return router;
}
