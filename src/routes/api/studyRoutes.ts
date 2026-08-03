import { Router } from "express";
import { syncStudyProgress } from "../../tools/study/psychometric.js";

/** REST mirror of sync_psychometric_study_progress. */
export function buildStudyRouter(): Router {
  const router = Router();

  router.post("/study/sync", (_req, res) => {
    try {
      const output = syncStudyProgress();
      res.json({ output });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  return router;
}
