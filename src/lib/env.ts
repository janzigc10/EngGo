type NodeEnv = "development" | "test" | "production";

type ServerEnv = {
  nodeEnv: NodeEnv;
  openAiApiKey?: string;
  databaseUrl?: string;
  directUrl?: string;
  sentryDsn?: string;
};

function readOptionalEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function readNodeEnv(): NodeEnv {
  const value = process.env.NODE_ENV;

  if (value === "production" || value === "test") {
    return value;
  }

  return "development";
}

export const env: ServerEnv = {
  nodeEnv: readNodeEnv(),
  openAiApiKey: readOptionalEnv("OPENAI_API_KEY"),
  databaseUrl: readOptionalEnv("DATABASE_URL"),
  directUrl: readOptionalEnv("DIRECT_URL"),
  sentryDsn: readOptionalEnv("SENTRY_DSN"),
};
