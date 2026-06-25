import { Router } from "express";
import * as claudeData from "../services/claudeData/index.js";
import { htmlShell } from "./htmlShell.js";

const claudeRouter = Router();

claudeRouter.get("/dashboard/claude", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(htmlShell("Claude Analytics", "claude", "ltr", "en"));
});

claudeRouter.get("/api/claude/overview", (_req, res) => {
    res.json(claudeData.getOverview());
});

claudeRouter.get("/api/claude/projects", (_req, res) => {
    res.json(claudeData.getProjects());
});

claudeRouter.get("/api/claude/sessions", (req, res) => {
    const project = typeof req.query.project === "string" ? req.query.project : undefined;
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const sourceParam = typeof req.query.source === "string" ? req.query.source : "all";
    const source = sourceParam === "code" || sourceParam === "cowork" ? sourceParam : "all";
    const limit = req.query.limit != null ? parseInt(String(req.query.limit), 10) : undefined;
    res.json(claudeData.getSessions({ project, search, source, limit: limit && !Number.isNaN(limit) ? limit : undefined }));
});

claudeRouter.get("/api/claude/sessions/:id", (req, res) => {
    const sourceParam = typeof req.query.source === "string" ? req.query.source : undefined;
    const source = sourceParam === "cowork" ? "cowork" : sourceParam === "code" ? "code" : undefined;
    const detail = claudeData.getSessionDetail(req.params.id, source);
    if (!detail) {
        res.status(404).json({ error: "session not found" });
        return;
    }
    res.json(detail);
});

claudeRouter.get("/api/claude/costs", (_req, res) => {
    res.json(claudeData.getCosts());
});

export default claudeRouter;