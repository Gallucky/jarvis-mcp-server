import { Router } from "express";
import { extractWebPage, validateMarkdown } from "../../tools/obsidian.js";
import { writeCanvasFile, writeBaseFile } from "../../tools/obsidianStructured.js";
import { errorText } from "../../tools/obsidianShared.js";

/** REST mirror of the "Optional" obsidian_* MCP tools (not obsidian_cli — too raw for a web-facing token). */
export function buildObsidianRouter(): Router {
  const router = Router();

  router.get("/obsidian/defuddle", async (req, res) => {
    const url = req.query.url;
    if (typeof url !== "string" || !url) {
      res.status(400).json({ error: "Query param 'url' is required." });
      return;
    }
    const property = typeof req.query.property === "string" ? req.query.property : undefined;
    try {
      const content = await extractWebPage(url, property);
      res.json({ url, content });
    } catch (error) {
      res.status(502).json({ error: errorText(error) });
    }
  });

  router.post("/obsidian/validate-markdown", (req, res) => {
    const { content } = req.body ?? {};
    if (typeof content !== "string") {
      res.status(400).json({ error: "Body requires a 'content' string." });
      return;
    }
    const issues = validateMarkdown(content);
    res.json({ valid: issues.length === 0, issues });
  });

  router.post("/obsidian/canvas", async (req, res) => {
    const { path, json } = req.body ?? {};
    if (typeof path !== "string" || typeof json !== "string") {
      res.status(400).json({ error: "Body requires 'path' and 'json' strings." });
      return;
    }
    try {
      const result = await writeCanvasFile(path, json);
      if (!result.written) {
        res.status(422).json({ errors: result.errors });
        return;
      }
      res.status(201).json({ path: result.path });
    } catch (error) {
      res.status(502).json({ error: errorText(error) });
    }
  });

  router.post("/obsidian/base", async (req, res) => {
    const { path, yaml } = req.body ?? {};
    if (typeof path !== "string" || typeof yaml !== "string") {
      res.status(400).json({ error: "Body requires 'path' and 'yaml' strings." });
      return;
    }
    try {
      const result = await writeBaseFile(path, yaml);
      if (!result.written) {
        res.status(422).json({ error: result.error });
        return;
      }
      res.status(201).json({ path: result.path });
    } catch (error) {
      res.status(502).json({ error: errorText(error) });
    }
  });

  return router;
}
