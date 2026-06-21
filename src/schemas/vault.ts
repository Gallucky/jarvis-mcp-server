import { z } from "zod";

export const ReadNoteInputSchema = z
  .object({
    path: z
      .string()
      .min(1)
      .describe("Vault-relative path to the note, e.g. 'Projects/Jarvis/spec.md'"),
  })
  .strict();
export type ReadNoteInput = z.infer<typeof ReadNoteInputSchema>;

export const CreateNoteInputSchema = z
  .object({
    path: z
      .string()
      .min(1)
      .describe("Vault-relative path for the new note, e.g. 'Inbox/Idea.md'"),
    content: z.string().describe("Full Markdown content for the note"),
    overwrite: z
      .boolean()
      .default(false)
      .describe("If false (default), fails when a note already exists at this path"),
  })
  .strict();
export type CreateNoteInput = z.infer<typeof CreateNoteInputSchema>;

export const AppendNoteInputSchema = z
  .object({
    path: z
      .string()
      .min(1)
      .describe("Vault-relative path to the note to append to"),
    content: z
      .string()
      .describe("Content to append to the end of the file (a leading newline is added automatically)"),
  })
  .strict();
export type AppendNoteInput = z.infer<typeof AppendNoteInputSchema>;

export const ListNotesInputSchema = z
  .object({
    folder: z
      .string()
      .default("")
      .describe("Vault-relative folder path, e.g. 'Projects/Jarvis'. Empty string = vault root."),
  })
  .strict();
export type ListNotesInput = z.infer<typeof ListNotesInputSchema>;

export const SearchVaultInputSchema = z
  .object({
    query: z.string().min(1).describe("Search text to match across the vault"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(20)
      .describe("Maximum number of results to return (default 20)"),
  })
  .strict();
export type SearchVaultInput = z.infer<typeof SearchVaultInputSchema>;
