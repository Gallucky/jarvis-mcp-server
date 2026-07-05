import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { execFile } from "child_process";
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from "fs";
import { randomUUID } from "crypto";
import { tmpdir } from "os";
import { join } from "path";
import {
  DISCORD_SCRIPTS_DIR,
  DISCORD_WEBHOOKS_DIR,
  DISCORD_SEND_SCRIPT_NAME,
} from "../constants.js";
import {
  SendDiscordNotificationInputSchema,
  type SendDiscordNotificationInput,
} from "../schemas/discord.js";

const PLACEHOLDER_URL = "REPLACE_WITH_DISCORD_WEBHOOK_URL";

// Gal's Discord user ID -- not a secret, safe to hardcode (matches the
// allowed_mentions entry baked into SEND_SCRIPT_TEMPLATE below).
const MENTION_USER_ID = "416185790591401985";

// Some MCP clients HTML-escape '<'/'>'/'&' in tool-call argument text before
// it reaches this server (so a caller-typed '<@id>' can arrive as '&lt;@id&gt;').
// Decoding here is a cheap safety net regardless of where the escaping happens.
const HTML_ENTITIES: Record<string, string> = {
  "&lt;": "<",
  "&gt;": ">",
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

/**
 * One generic script reused by every webhook -- see DISCORD_HOME_SERVER_DIR
 * comment in constants.ts. Never hardcode a webhook URL in here; it's read
 * fresh from the -EnvPath file every run so rotating a URL never needs a
 * code change.
 */
const SEND_SCRIPT_TEMPLATE = `# ${DISCORD_SEND_SCRIPT_NAME} - generic Discord webhook sender (reusable across all scheduled tasks)
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File "${DISCORD_SEND_SCRIPT_NAME}" -EnvPath "C:\\path\\to\\Some Webhook.env" -MessageFile "C:\\path\\to\\msg.txt"
#   powershell -NoProfile -ExecutionPolicy Bypass -File "${DISCORD_SEND_SCRIPT_NAME}" -EnvPath "C:\\path\\to\\Some Webhook.env" -Message "plain text"
#
# Reads the webhook URL fresh from -EnvPath each run. Never hardcode a webhook URL here.
param(
    [Parameter(Mandatory = $true)]
    [string]$EnvPath,
    [string]$Message,
    [string]$MessageFile
)
if (-not $Message -and $MessageFile) {
    if (-not (Test-Path $MessageFile)) {
        Write-Output 'SEND_RESULT: FAILED - MessageFile not found'
        exit 1
    }
    $Message = Get-Content -Path $MessageFile -Raw -Encoding UTF8
}
if (-not $Message -or $Message.Trim().Length -eq 0) {
    Write-Output 'SEND_RESULT: FAILED - No message provided'
    exit 1
}
$Message = $Message.Trim()
if (-not (Test-Path $EnvPath)) {
    Write-Output 'SEND_RESULT: FAILED - webhook env file not found'
    exit 1
}
$url = (Get-Content -Path $EnvPath -Raw).Trim()
if (-not $url -or $url -eq '${PLACEHOLDER_URL}') {
    Write-Output 'SEND_RESULT: FAILED - webhook env file has no URL set yet'
    exit 1
}
$bodyObj = @{
    content          = $Message
    allowed_mentions = @{ users = @('416185790591401985') }
}
$json = $bodyObj | ConvertTo-Json -Compress
try {
    Invoke-RestMethod -Uri $url -Method Post -Body $json -ContentType 'application/json; charset=utf-8' | Out-Null
    Write-Output 'SEND_RESULT: SUCCESS'
} catch {
    Write-Output ('SEND_RESULT: FAILED - ' + $_.Exception.Message)
}
`;

export function registerDiscordTools(server: McpServer): void {
  server.registerTool(
    "discord_send_notification",
    {
      title: "Send Discord Notification",
      description: `Posts a message to a Discord channel via webhook, using the shared
'${DISCORD_SEND_SCRIPT_NAME}' PowerShell script under '${DISCORD_SCRIPTS_DIR}'.
Creates that script if it doesn't exist yet, so this works from a fresh machine
with no manual setup beyond pasting real webhook URLs into the per-webhook .env
files under '${DISCORD_WEBHOOKS_DIR}'.

Args:
  - webhookName (string): Which webhook to use, e.g. 'Daily Brief'
  - message (string): Plain text message to post
  - mentionUser (boolean, default true): Prepend a ping to Gal. Built server-side
    -- don't type '<@id>' into message yourself, it can arrive HTML-escaped.

Returns:
  SUCCESS, or FAILED with a reason -- including the case where the webhook's
  .env file was just created as a placeholder and still needs a real URL.

Examples:
  - Use when: a scheduled task (daily brief, weekly planner, etc.) finishes
    and should notify you in Discord`,
      inputSchema: SendDiscordNotificationInputSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params: SendDiscordNotificationInput) => {
      try {
        ensureSendScript();
        const env = ensureWebhookEnvFile(params.webhookName);
        if (env.isNewPlaceholder) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `Created a placeholder webhook file at '${env.path}' -- paste the real Discord webhook URL into it, then try again.`,
              },
            ],
          };
        }
        const finalMessage = buildFinalMessage(params.message, params.mentionUser);
        const result = await runSendScript(env.path, finalMessage);
        return { content: [{ type: "text", text: result }] };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
        };
      }
    }
  );
}

function ensureSendScript(): void {
  mkdirSync(DISCORD_SCRIPTS_DIR, { recursive: true });
  const scriptPath = `${DISCORD_SCRIPTS_DIR}/${DISCORD_SEND_SCRIPT_NAME}`;
  if (!existsSync(scriptPath)) {
    writeFileSync(scriptPath, SEND_SCRIPT_TEMPLATE, "utf-8");
  }
}

function decodeHtmlEntities(text: string): string {
  return text.replace(/&lt;|&gt;|&amp;|&quot;|&#39;|&apos;/g, (match) => HTML_ENTITIES[match]);
}

function buildFinalMessage(message: string, mentionUser: boolean): string {
  const decoded = decodeHtmlEntities(message);
  return mentionUser ? `<@${MENTION_USER_ID}>\n${decoded}` : decoded;
}

function sanitizeWebhookName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || /[\\/:*?"<>|]/.test(trimmed)) {
    throw new Error(`Invalid webhook name: '${name}'`);
  }
  return trimmed;
}

function ensureWebhookEnvFile(webhookName: string): { path: string; isNewPlaceholder: boolean } {
  const safeName = sanitizeWebhookName(webhookName);
  mkdirSync(DISCORD_WEBHOOKS_DIR, { recursive: true });
  const envPath = `${DISCORD_WEBHOOKS_DIR}/${safeName}.env`;
  if (existsSync(envPath)) {
    return { path: envPath, isNewPlaceholder: false };
  }
  writeFileSync(envPath, PLACEHOLDER_URL, "utf-8");
  return { path: envPath, isNewPlaceholder: true };
}

function runSendScript(envPath: string, message: string): Promise<string> {
  const scriptPath = `${DISCORD_SCRIPTS_DIR}/${DISCORD_SEND_SCRIPT_NAME}`;
  const messageFile = join(tmpdir(), `jarvis-discord-${randomUUID()}.txt`);
  writeFileSync(messageFile, message, "utf-8");
  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath, "-EnvPath", envPath, "-MessageFile", messageFile],
      { windowsHide: true },
      (error, stdout, stderr) => {
        try {
          unlinkSync(messageFile);
        } catch {
          // best-effort cleanup, not worth failing the call over
        }
        if (error && !stdout) {
          reject(new Error(stderr || error.message));
          return;
        }
        resolve(stdout.trim());
      }
    );
  });
}
