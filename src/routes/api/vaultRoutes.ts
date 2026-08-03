import { Router } from "express";
import type { ObsidianClient } from "../../services/obsidianClient.js";
import { describeObsidianError } from "../../services/obsidianClient.js";
import { readNote, createNote, appendNote, listNotes, searchVault } from "../../tools/vault.js";
import { createDistillation } from "../../tools/jarvis.js";
import { DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT } from "../../constants.js";

/**
 * REST mirror of the jarvis_* vault MCP tools, for callers that speak plain
 * HTTP (Gemini/AI Studio) instead of the MCP protocol. Calls the exact same
 * functions the MCP tools call (see src/tools/vault.ts, src/tools/jarvis.ts)
 * so behavior can't drift between the two surfaces.
 */
export function buildVaultRouter(obsidian: ObsidianClient): Router {
  const router = Router();

  router.get("/vault/note", (req, res) => {
    const path = req.query.path;
    if (typeof path !== "string" || !path) {
      res.status(400).json({ error: "Query param 'path' is required." });
      return;
    }
    try {
      const result = readNote(path);
      if (!result.found) {
        res.status(404).json({ error: `No note found at '${path}'.` });
        return;
      }
      res.json({ path, content: result.content, truncated: result.truncated });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.post("/vault/note", (req, res) => {
    const { path, content, overwrite } = req.body ?? {};
    if (typeof path !== "string" || typeof content !== "string") {
      res.status(400).json({ error: "Body requires 'path' and 'content' strings." });
      return;
    }
    try {
      const result = createNote(path, content, Boolean(overwrite));
      if (!result.created) {
        res.status(409).json({ error: result.reason });
        return;
      }
      res.status(201).json({ path });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.patch("/vault/note", (req, res) => {
    const { path, content } = req.body ?? {};
    if (typeof path !== "string" || typeof content !== "string") {
      res.status(400).json({ error: "Body requires 'path' and 'content' strings." });
      return;
    }
    try {
      appendNote(path, content);
      res.json({ path });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.get("/vault/notes", (req, res) => {
    const folder = typeof req.query.folder === "string" ? req.query.folder : "";
    try {
      const { entries } = listNotes(folder);
      res.json({ folder: folder || "/", count: entries.length, entries });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.get("/vault/search", (req, res) => {
    const query = req.query.query;
    if (typeof query !== "string" || !query) {
      res.status(400).json({ error: "Query param 'query' is required." });
      return;
    }
    const limit = Math.min(MAX_SEARCH_LIMIT, Math.max(1, Number(req.query.limit) || DEFAULT_SEARCH_LIMIT));
    const outcome = searchVault(query, limit);
    if (!outcome.ready) {
      res.status(503).json({ error: "Search index is still building — try again in a moment." });
      return;
    }
    res.json({ query, count: outcome.results.length, results: outcome.results });
  });

  router.post("/vault/distillation", async (req, res) => {
    const { title, content } = req.body ?? {};
    if (typeof title !== "string" || typeof content !== "string") {
      res.status(400).json({ error: "Body requires 'title' and 'content' strings." });
      return;
    }
    try {
      const { path } = await createDistillation(obsidian, title, content);
      res.status(201).json({ path });
    } catch (error) {
      res.status(502).json({ error: describeObsidianError(error) });
    }
  });

  return router;
}
