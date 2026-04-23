import { z } from "zod";

type NodeEnv = "development" | "test" | "production";

export type ServerEnv = {
  nodeEnv: NodeEnv;
  openAiApiKey?: string;
  openAiBaseUrl?: string;
  openAiModel?: string;
  databaseUrl?: string;
  directUrl?: string;
  sentryDsn?: string;
};

const optionalTrimmedString = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();

    return trimmed.length > 0 ? trimmed : undefined;
  },
  z.string().min(1).optional(),
);

const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).optional(),
    OPENAI_API_KEY: optionalTrimmedString,
    OPENAI_BASE_URL: optionalTrimmedString,
    OPENAI_MODEL: optionalTrimmedString,
    DATABASE_URL: optionalTrimmedString,
    DIRECT_URL: optionalTrimmedString,
    SENTRY_DSN: optionalTrimmedString,
  })
  .transform((value): ServerEnv => ({
    nodeEnv: value.NODE_ENV ?? "development",
    openAiApiKey: value.OPENAI_API_KEY,
    openAiBaseUrl: value.OPENAI_BASE_URL,
    openAiModel: value.OPENAI_MODEL,
    databaseUrl: value.DATABASE_URL,
    directUrl: value.DIRECT_URL,
    sentryDsn: value.SENTRY_DSN,
  }));

export const env = serverEnvSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
  DATABASE_URL: process.env.DATABASE_URL,
  DIRECT_URL: process.env.DIRECT_URL,
  SENTRY_DSN: process.env.SENTRY_DSN,
});
