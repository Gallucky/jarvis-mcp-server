import { z } from "zod";

export const CreateDistillationInputSchema = z
  .object({
    title: z
      .string()
      .min(1)
      .describe("Short title for this distillation, e.g. 'LiveSync CouchDB Debugging'"),
    content: z
      .string()
      .min(1)
      .describe("The distilled Markdown content to save"),
  })
  .strict();
export type CreateDistillationInput = z.infer<typeof CreateDistillationInputSchema>;
