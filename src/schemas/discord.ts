import { z } from "zod";

export const SendDiscordNotificationInputSchema = z
  .object({
    webhookName: z
      .string()
      .min(1)
      .describe(
        "Which webhook to send through, e.g. 'Daily Brief' or 'Jarvis Morning Digest'. " +
          "Maps to a same-named .env file under the webhooks folder -- first call " +
          "creates a placeholder if it doesn't exist yet."
      ),
    message: z.string().min(1).describe("Plain text message to post to the Discord channel."),
    mentionUser: z
      .boolean()
      .optional()
      .default(true)
      .describe(
        "Whether to prepend a Discord mention pinging Gal before the message. Defaults to true. " +
          "The tool builds the mention itself server-side rather than the caller typing raw angle " +
          "brackets into `message`, since those can arrive HTML-escaped depending on the client."
      ),
  })
  .strict();
export type SendDiscordNotificationInput = z.infer<typeof SendDiscordNotificationInputSchema>;
