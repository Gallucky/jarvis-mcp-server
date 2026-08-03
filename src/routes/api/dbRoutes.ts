import { Router } from "express";
import { runQuery, listTables, describeTable } from "../../tools/sqlite.js";

/**
 * REST mirror of the read-only db_* MCP tools. db_execute (writes) and raw
 * arbitrary statements are deliberately NOT exposed here -- a web-facing
 * token should not be able to mutate the database. /db/query additionally
 * enforces SELECT-only at this layer (on top of whatever the caller sends),
 * since this endpoint is reachable by a caller (Gemini) that never goes
 * through the same trust review as Claude's MCP session.
 */
export function buildDbRouter(): Router {
  const router = Router();

  router.post("/db/query", (req, res) => {
    const { sql, params } = req.body ?? {};
    if (typeof sql !== "string" || !sql.trim()) {
      res.status(400).json({ error: "Body requires a non-empty 'sql' string." });
      return;
    }
    if (!/^\s*select\b/i.test(sql)) {
      res.status(403).json({ error: "Only SELECT statements are allowed via the REST API." });
      return;
    }
    try {
      const rows = runQuery(sql, Array.isArray(params) ? params : []);
      res.json({ rows });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.get("/db/tables", (_req, res) => {
    try {
      res.json({ tables: listTables() });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.get("/db/tables/:table", (req, res) => {
    try {
      const columns = describeTable(req.params.table);
      if (columns.length === 0) {
        res.status(404).json({ error: `No table named '${req.params.table}' found.` });
        return;
      }
      res.json({ table: req.params.table, columns });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  return router;
}
