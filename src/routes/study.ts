import { Router } from "express";
import db from "../services/db.js";
import { execSync } from "child_process";
import { htmlShell } from "./htmlShell.js";

const studyRouter = Router();

studyRouter.get("/dashboard/study", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(htmlShell("Study Dashboard", "study"));
});

studyRouter.get("/api/stats", (_req, res) => {
  const overall = db.prepare(`
    SELECT COUNT(*) as total, SUM(completed) as done
    FROM exercise_completions
  `).get() as { total: number; done: number };

  const bySection = db.prepare(`
    SELECT section, COUNT(*) as total, SUM(completed) as done
    FROM exercise_completions
    GROUP BY section
    ORDER BY section
  `).all();

  const byTopic = db.prepare(`
    SELECT section, zone, topic,
           COUNT(*) as total, SUM(completed) as done,
           COUNT(*) - SUM(completed) as remaining
    FROM exercise_completions
    GROUP BY section, topic
    ORDER BY remaining DESC
  `).all();

  const byLesson = db.prepare(`
    SELECT lesson_number, COUNT(*) as total, SUM(completed) as done,
           MAX(CASE WHEN note_path LIKE '01 Notes/Psychometric/Lessons/Homework/%' THEN note_path END) as note_path
    FROM exercise_completions
    GROUP BY lesson_number
    ORDER BY lesson_number
  `).all();

  res.json({ overall, bySection, byTopic, byLesson });
});

studyRouter.post("/api/sync-study", (_req, res) => {
  try {
    execSync("node dist/scripts/syncCheckboxes.js", { stdio: "pipe", windowsHide: true });
    res.json({ success: true, message: "Study progress synchronized successfully." });
  } catch (err) {
    console.error("Error synchronizing study progress:", err);
    res.status(500).json({ success: false, error: (err) });
  }
});

export default studyRouter;