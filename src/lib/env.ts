import { z } from "zod";

type NodeEnv = "development" | "test" | "production";

export type ServerEnv = {
  nodeEnv: NodeEnv;
  openAiApiKey?: string;
  databaseUrl?: string;
  directUrl?: string;
  sentryDsn?: string;
};

const optionalTrimmedString = z
  .string()
  .trim()
  .min(1)
  .optional()
  .transform((value) => value ?? undefined);

const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).optional(),
    OPENAI_API_KEY: optionalTrimmedString,
    DATABASE_URL: optionalTrimmedString,
    DIRECT_URL: optionalTrimmedString,
    SENTRY_DSN: optionalTrimmedString,
  })
  .transform((value): ServerEnv => ({
    nodeEnv: value.NODE_ENV ?? "development",
    openAiApiKey: value.OPENAI_API_KEY,
    databaseUrl: value.DATABASE_URL,
    directUrl: value.DIRECT_URL,
    sentryDsn: value.SENTRY_DSN,
  }));

export const env = serverEnvSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  DATABASE_URL: process.env.DATABASE_URL,
  DIRECT_URL: process.env.DIRECT_URL,
  SENTRY_DSN: process.env.SENTRY_DSN,
});
