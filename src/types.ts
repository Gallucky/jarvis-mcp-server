export interface ObsidianFileStat {
  ctime: number;
  mtime: number;
  size: number;
}

export interface ObsidianNoteResponse {
  content: string;
  frontmatter?: Record<string, unknown>;
  tags?: string[];
  stat?: ObsidianFileStat;
  path: string;
}

export interface ObsidianSearchMatch {
  context: string;
  match: {
    start: number;
    end: number;
  };
}

export interface ObsidianSearchResult {
  filename: string;
  score: number;
  matches?: ObsidianSearchMatch[];
}

export interface VaultListResponse {
  files: string[];
}

export interface NoteSummary {
  path: string;
  is_folder: boolean;
}
