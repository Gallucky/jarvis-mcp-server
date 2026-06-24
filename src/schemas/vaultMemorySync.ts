import { z } from "zod";

export const VaultSnapshotInputSchema = z
  .object({
    notePaths: z
      .array(z.string())
      .optional()
      .describe("Vault-relative note paths to read; defaults to ME.md and Claude.Reports.md"),
  })
  .strict();
export type VaultSnapshotInput = z.infer<typeof VaultSnapshotInputSchema>;

export const MemoryDiffInputSchema = z
  .object({
    vaultNotePaths: z
      .array(z.string())
      .optional()
      .describe("Vault-relative note paths to read; defaults to ME.md and Claude.Reports.md"),
    memoryFileNames: z
      .array(z.string())
      .optional()
      .describe("Memory file slugs without '.md' to include; defaults to all existing memory files"),
  })
  .strict();
export type MemoryDiffInput = z.infer<typeof MemoryDiffInputSchema>;

export const MemorySyncInputSchema = z
  .object({
    name: z
      .string()
      .regex(/^[a-z0-9-]+$/, "must be a kebab-case slug (lowercase letters, digits, hyphens)")
      .describe("Kebab-case slug; becomes '<name>.md' in the memory folder"),
    description: z.string().min(1).describe("One-line summary, used in the file's frontmatter"),
    type: z.enum(["user", "feedback", "project", "reference"]).describe("Memory category"),
    content: z.string().min(1).describe("Markdown body for the memory file (without frontmatter)"),
    indexLine: z
      .string()
      .min(1)
      .describe("The single line to add or replace in MEMORY.md, e.g. '- [Title](name.md) — one-line hook'"),
  })
  .strict();
export type MemorySyncInput = z.infer<typeof MemorySyncInputSchema>;
