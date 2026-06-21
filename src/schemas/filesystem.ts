import { z } from "zod";

// A read file input needs to be a string with at least one character
// and can contain a maximum number of lines to read from the file.
// The default value for max_lines is -1, which means read all lines.
// The output will be the contents of the file as a string.
export const FSReadSchema = z
    .object({
        path: z
            .string()
            .min(1)
            .describe("Path to the file to read"),
        max_lines: z
            .number()
            .default(-1)
            .describe("Maximum number of lines to read from the file, -1 for all lines"),
    })
    .strict();
// Create the type from the read schema.
export type FSReadInput = z.infer<typeof FSReadSchema>;

// An append file input needs to be a string with at least one character
// and the contents to append to the file also a string with at least one character.
// The output will be the number of bytes written to the file.
export const FSAppendSchema = z
    .object({
        path: z
            .string()
            .min(1)
            .describe("Path to the file to append to"),
        contents: z
            .string()
            .min(1)
            .describe("Contents to append to the file"),
    })
    .strict();
// Create the type from the append schema.
export type FSAppendInput = z.infer<typeof FSAppendSchema>;

// A write file input needs to be a string with at least one character
// and the contents to write to the file also a string with at least one character.
// The output will be the number of bytes written to the file.
export const FSWriteSchema = z
    .object({
        path: z
            .string()
            .min(1)
            .describe("Path to the file to write to"),
        contents: z
            .string()
            .min(1)
            .describe("Contents to write to the file"),
    })
    .strict();
// Create the type from the write schema.
export type FSWriteInput = z.infer<typeof FSWriteSchema>;

// A list directory input needs to be a string with at least one character
// and can contain a boolean to list the directory recursively.
export const FSListDirSchema = z
    .object({
        path: z
            .string()
            .min(1)
            .describe("Path to the directory to list"),
        recursive: z
            .boolean()
            .default(false)
            .describe("Whether to list the directory recursively"),
        // optionally, we can add:
        // a filter to only list files with a certain extension
        // a max levels deep to list
        // max number of files to list
    })
    .strict();
// Create the type from the list directory schema.
export type FSListDirInput = z.infer<typeof FSListDirSchema>;

// A move file/folder input needs to be a string with at least one character
// for the source path and a string with at least one character for
// the destination path which is always a path to a folder.
export const FSMoveSchema = z
    .object({
        path_from: z
            .string()
            .min(1)
            .describe("Path to the file/folder to move"),
        path_to: z
            .string()
            .min(1)
            .describe("Path to the folder to move the file/folder to"),
    })
    .strict();
// Create the type from the move schema.
export type FSMoveInput = z.infer<typeof FSMoveSchema>;

// A delete file/folder input needs to be a string with at least one character
// for the path to the file/folder to delete and a boolean to force the deletion.
export const FSDeleteSchema = z
    .object({
        path: z
            .string()
            .min(1)
            .describe("Path to the file/folder to delete"),
        confirm: z
            .boolean()
            .default(false)
            .describe("Whether to delete the file/folder without asking for confirmation"),
    })
    .strict();
// Create the type from the delete schema.
export type FSDeleteInput = z.infer<typeof FSDeleteSchema>;