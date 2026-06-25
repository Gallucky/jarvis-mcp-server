import { Router, json } from "express";
import db from "../services/db.js";

const tasksScreenRouter = Router();
tasksScreenRouter.use(json());

// GET /api/tasks
tasksScreenRouter.get("/api/tasks", (_req, res) => {
    const tasks = db.prepare(`SELECT * FROM tasks ORDER BY created_at DESC`).all();
    res.json(tasks);
});

// POST /api/tasks
tasksScreenRouter.post("/api/tasks", (req, res) => {
    const { title, description, priority, area, due_date } = req.body;
    if (!title) { res.status(400).json({ error: "title required" }); return; }

    const result = db.prepare(`
    INSERT INTO tasks (title, description, priority, area, due_date)
    VALUES (?, ?, ?, ?, ?)
  `).run(title, description ?? null, priority ?? "Medium", area ?? null, due_date ?? null);

    const task = db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(result.lastInsertRowid);
    res.status(201).json(task);
});

// PATCH /api/tasks/:id
tasksScreenRouter.patch("/api/tasks/:id", (req, res) => {
    const allowed = ["title", "description", "status", "priority", "area", "due_date"] as const;

    const fields = allowed.filter(k => k in req.body);
    if (fields.length === 0) { res.status(400).json({ error: "nothing to update" }); return; }

    const setClauses = fields.map(k => `${k} = ?`).join(", ");
    const values = fields.map(k => req.body[k] ?? null);

    db.prepare(`
        UPDATE tasks SET ${setClauses}, updated_at = datetime('now')
        WHERE id = ?
    `).run(...values, req.params.id);

    const task = db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(req.params.id);
    if (!task) { res.status(404).json({ error: "not found" }); return; }
    res.json(task);
});

// DELETE /api/tasks/:id
tasksScreenRouter.delete("/api/tasks/:id", (req, res) => {
    db.prepare(`DELETE FROM tasks WHERE id = ?`).run(req.params.id);
    res.status(204).send();
});

export default tasksScreenRouter;