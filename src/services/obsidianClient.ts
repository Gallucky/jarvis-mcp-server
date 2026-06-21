import axios, { AxiosError, type AxiosInstance } from "axios";
import type {
  ObsidianNoteResponse,
  ObsidianSearchResult,
  VaultListResponse,
} from "../types.js";

/**
 * Thin client around the Obsidian Local REST API plugin
 * (https://github.com/coddingtonbear/obsidian-local-rest-api).
 *
 * This talks to Obsidian running on THIS machine (the mini PC) over loopback.
 * Obsidian must be open for these calls to succeed -- the plugin's server
 * only runs while the Obsidian app process is alive.
 */
export class ObsidianClient {
  private readonly http: AxiosInstance;

  constructor(baseUrl: string, apiKey: string) {
    if (!baseUrl) throw new Error("OBSIDIAN_API_BASE_URL is required");
    if (!apiKey) throw new Error("OBSIDIAN_API_KEY is required");

    this.http = axios.create({
      baseURL: baseUrl,
      timeout: 15000,
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      // We treat 404 as a normal (non-throwing) response so callers can
      // distinguish "not found" from a real connectivity/auth failure.
      validateStatus: (status) => (status >= 200 && status < 300) || status === 404,
    });
  }

  /** Confirms Obsidian + the plugin are actually reachable right now. */
  async ping(): Promise<boolean> {
    try {
      const res = await this.http.get("/");
      return res.status === 200;
    } catch {
      return false;
    }
  }

  async readNote(path: string): Promise<ObsidianNoteResponse | null> {
    const res = await this.http.get<ObsidianNoteResponse | string>(
      `/vault/${encodePath(path)}`,
      { headers: { Accept: "application/vnd.olrapi.note+json" } }
    );
    if (res.status === 404) return null;

    // The plugin returns rich JSON when Accept is set as above; fall back
    // gracefully if an older plugin version just returns plain text.
    if (typeof res.data === "string") {
      return { content: res.data, path };
    }
    return res.data;
  }

  /** Returns true if a file exists at this path. */
  async noteExists(path: string): Promise<boolean> {
    const res = await this.http.get(`/vault/${encodePath(path)}`);
    return res.status === 200;
  }

  /** Creates a new file, or fully overwrites an existing one. */
  async writeNote(path: string, content: string): Promise<void> {
    await this.http.put(`/vault/${encodePath(path)}`, content, {
      headers: { "Content-Type": "text/markdown" },
      validateStatus: (status) => status >= 200 && status < 300,
    });
  }

  /** Appends content to the end of a file (creating it if it doesn't exist). */
  async appendNote(path: string, content: string): Promise<void> {
    await this.http.post(`/vault/${encodePath(path)}`, content, {
      headers: { "Content-Type": "text/markdown" },
      validateStatus: (status) => status >= 200 && status < 300,
    });
  }

  /** Lists files and subfolders directly inside `folder` (non-recursive). */
  async listFolder(folder: string): Promise<string[]> {
    const cleanFolder = folder.replace(/^\/+|\/+$/g, "");
    const urlPath = cleanFolder ? `/vault/${encodePath(cleanFolder)}/` : "/vault/";
    const res = await this.http.get<VaultListResponse>(urlPath);
    if (res.status === 404) return [];
    return res.data.files ?? [];
  }

  /** Full-text search across the vault using Obsidian's built-in search. */
  async searchSimple(query: string, limit: number): Promise<ObsidianSearchResult[]> {
    const res = await this.http.post<ObsidianSearchResult[]>(
      "/search/simple/",
      null,
      {
        params: { query, contextLength: 100 },
        validateStatus: (status) => status >= 200 && status < 300,
      }
    );
    return (res.data ?? []).slice(0, limit);
  }
}

/** Encodes each path segment individually so legitimate "/" separators survive. */
function encodePath(path: string): string {
  return path
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
}

export function describeObsidianError(error: unknown): string {
  if (error instanceof AxiosError) {
    if (error.code === "ECONNREFUSED") {
      return "Error: Could not reach Obsidian's Local REST API. Is Obsidian open on the mini PC, and is the HTTP server enabled in Settings -> Local REST API?";
    }
    if (error.response) {
      switch (error.response.status) {
        case 401:
          return "Error: Obsidian rejected the API key. Check OBSIDIAN_API_KEY in your .env file against Settings -> Local REST API.";
        case 404:
          return "Error: That path was not found in the vault.";
        case 405:
          return "Error: That operation isn't supported on this path (it may be a folder, not a file).";
        default:
          return `Error: Obsidian's API returned status ${error.response.status}.`;
      }
    }
    if (error.code === "ECONNABORTED") {
      return "Error: Request to Obsidian timed out.";
    }
  }
  return `Error: Unexpected error talking to Obsidian: ${
    error instanceof Error ? error.message : String(error)
  }`;
}
