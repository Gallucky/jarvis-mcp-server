import { Router } from "express";
import { htmlShell } from "./htmlShell.js";
import studyRouter from "./study.js";
import claudeRouter from "./claude.js";
import tasksScreenRouter from "./tasks_screen.js";

const dashboardRouter = Router();

dashboardRouter.use(studyRouter);
dashboardRouter.use(claudeRouter);
dashboardRouter.use(tasksScreenRouter);

// Main OS dashboard (hub)
dashboardRouter.get("/dashboard", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(htmlShell("Dashboard", "home"));
});

// Tasks dashboard
dashboardRouter.get("/dashboard/task", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(htmlShell("Tasks", "task"));
});

export default dashboardRouter;