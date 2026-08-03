import { Router } from "express";
import express from "express";
import { sendMessage, resetSession, AVAILABLE_MODELS } from "../services/geminiChatService.js";

/**
 * Phone-friendly Gemini chat page, served on the dashboard's tailnet-only
 * port (same trust model as /dashboard/study etc. -- no separate password,
 * the tailnet itself is the perimeter). Exists because gemini.google.com's
 * own "Connected Apps" MCP support needs a Google AI Pro/Ultra subscription;
 * this page talks to the free Gemini API from the server side instead, so
 * the API key and Jarvis token never leave the mini PC.
 */
export function buildGeminiChatRouter(): Router {
  const router = Router();
  router.use(express.json());

  router.get("/dashboard/gemini", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(buildPageHtml());
  });

  router.post("/dashboard/gemini/api/message", async (req, res) => {
    const { sessionId, message, model } = req.body ?? {};
    if (typeof sessionId !== "string" || typeof message !== "string" || !message.trim()) {
      res.status(400).json({ error: "Body requires 'sessionId' and a non-empty 'message'." });
      return;
    }
    try {
      const reply = await sendMessage(sessionId, message, typeof model === "string" ? model : undefined);
      res.json({ reply });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.post("/dashboard/gemini/api/reset", (req, res) => {
    const { sessionId } = req.body ?? {};
    if (typeof sessionId === "string") resetSession(sessionId);
    res.json({ ok: true });
  });

  return router;
}

function buildPageHtml(): string {
  const modelOptions = AVAILABLE_MODELS.map((m) => `<option value="${m}">${m}</option>`).join("\n      ");

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
  <title>Gemini · Jarvis</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0; height: 100dvh; display: flex; flex-direction: column;
      background: #121212; color: #eee; font-family: system-ui, sans-serif;
    }
    header {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      padding: 10px 16px; border-bottom: 1px solid #2a2a2a; flex-shrink: 0;
    }
    header h1 { font-size: 16px; margin: 0; flex-shrink: 0; }
    header .controls { display: flex; align-items: center; gap: 6px; }
    header select, header button {
      background: #2a2a2a; color: #eee; border: none; border-radius: 8px;
      padding: 6px 10px; font-size: 12px;
    }
    #log { flex: 1; overflow-y: auto; padding: 12px 16px; display: flex; flex-direction: column; gap: 10px; }
    /* dir="auto" on each .msg (set in JS) lets the browser pick LTR/RTL per
       message based on its own content, instead of forcing the page's
       overall RTL onto Gemini's (usually English/code) replies. Placement
       (left/right) is handled separately below with physical margins, since
       align-self flex-start/flex-end flips meaning inside an RTL container --
       own messages should always sit on the physical right regardless of
       the page's base direction, same as WhatsApp/Telegram do. */
    .msg { max-width: 85%; width: fit-content; padding: 10px 14px; border-radius: 14px; line-height: 1.5; word-break: break-word; }
    .msg p { margin: 0 0 8px; }
    .msg p:last-child { margin-bottom: 0; }
    .msg ul, .msg ol { margin: 4px 0; padding-inline-start: 22px; }
    .msg code { background: rgba(255,255,255,0.12); padding: 1px 5px; border-radius: 4px; font-size: 0.9em; }
    .msg pre { background: #0d0d0d; padding: 10px 12px; border-radius: 8px; overflow-x: auto; direction: ltr; text-align: left; }
    .msg pre code { background: none; padding: 0; }
    .msg a { color: #8ab4f8; }
    .user { margin-left: auto; background: #3b6fd6; color: white; }
    .model { margin-right: auto; background: #2a2a2a; }
    form {
      display: flex; gap: 8px; padding: 10px 12px; border-top: 1px solid #2a2a2a;
      flex-shrink: 0; padding-bottom: max(10px, env(safe-area-inset-bottom));
    }
    textarea {
      flex: 1; resize: none; background: #1e1e1e; color: #eee; border: 1px solid #333;
      border-radius: 10px; padding: 10px 12px; font-size: 15px; font-family: inherit; max-height: 120px;
    }
    button[type="submit"] {
      background: #3b6fd6; color: white; border: none; border-radius: 10px; padding: 0 18px; font-size: 15px;
    }
  </style>
</head>
<body>
  <header>
    <h1>💬 Gemini · הכספת שלך</h1>
    <div class="controls">
      <select id="model" title="החלף מודל אם הגעת למכסה"></select>
      <button id="newChat">שיחה חדשה</button>
    </div>
  </header>
  <div id="log"></div>
  <form id="form">
    <textarea id="input" rows="1" dir="auto" placeholder="שאל משהו על הכספת..."></textarea>
    <button type="submit">שלח</button>
  </form>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/dompurify/dist/purify.min.js"></script>
  <script>
    const STORAGE_SESSION = 'jarvis-gemini-session-id';
    const STORAGE_HISTORY = 'jarvis-gemini-history';
    const STORAGE_MODEL = 'jarvis-gemini-model';

    // Persisted across reloads -- otherwise every refresh looked like a lost
    // conversation even though Gemini's own interaction chain was still intact.
    let sessionId = localStorage.getItem(STORAGE_SESSION);
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      localStorage.setItem(STORAGE_SESSION, sessionId);
    }
    let history = [];
    try { history = JSON.parse(localStorage.getItem(STORAGE_HISTORY) || '[]'); } catch {}

    const log = document.getElementById('log');
    const form = document.getElementById('form');
    const input = document.getElementById('input');
    const modelSelect = document.getElementById('model');

    modelSelect.innerHTML = \`${modelOptions}\`;
    modelSelect.value = localStorage.getItem(STORAGE_MODEL) || modelSelect.options[0].value;
    modelSelect.addEventListener('change', () => localStorage.setItem(STORAGE_MODEL, modelSelect.value));

    function createMessageDiv(role) {
      const div = document.createElement('div');
      div.className = 'msg ' + role;
      div.dir = 'auto'; // pick LTR/RTL per-message from its own content
      log.appendChild(div);
      return div;
    }

    // User's own text is shown as-is; Gemini's replies are Markdown --
    // rendered and sanitized (defense against a prompt-injected <script> tag
    // smuggled in through the model's own output).
    function setMessageContent(div, role, text) {
      if (role === 'user') div.textContent = text;
      else div.innerHTML = DOMPurify.sanitize(marked.parse(text));
    }

    function saveHistory() {
      localStorage.setItem(STORAGE_HISTORY, JSON.stringify(history));
    }

    for (const turn of history) {
      setMessageContent(createMessageDiv(turn.role), turn.role, turn.text);
    }
    log.scrollTop = log.scrollHeight;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const message = input.value.trim();
      if (!message) return;
      input.value = '';

      setMessageContent(createMessageDiv('user'), 'user', message);
      history.push({ role: 'user', text: message });
      saveHistory();

      const pending = createMessageDiv('model');
      pending.textContent = '...';

      try {
        const res = await fetch('/dashboard/gemini/api/message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, message, model: modelSelect.value }),
        });
        const data = await res.json();
        if (res.ok) {
          setMessageContent(pending, 'model', data.reply);
          history.push({ role: 'model', text: data.reply });
          saveHistory();
        } else {
          pending.textContent = 'שגיאה: ' + data.error;
        }
      } catch (err) {
        pending.textContent = 'שגיאת רשת: ' + err;
      }
      log.scrollTop = log.scrollHeight;
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        form.requestSubmit();
      }
    });

    document.getElementById('newChat').addEventListener('click', async () => {
      await fetch('/dashboard/gemini/api/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      history = [];
      saveHistory();
      log.innerHTML = '';
    });
  </script>
</body>
</html>`;
}
