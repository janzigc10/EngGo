import net from "node:net";

export type SupportedPlatform = NodeJS.Platform;

export type DevStackEnv = Partial<Record<string, string | undefined>>;

export type DevStackConfig = {
  host: string;
  backendPort: number;
  nextPort: number;
  backendUrl: string;
  pythonCommand: string;
  backendUrlWasCustomized: boolean;
};

export type CommandSpec = {
  command: string;
  args: string[];
  env?: Record<string, string>;
};

type CreateDevStackConfigOptions = {
  env?: DevStackEnv;
  platform?: SupportedPlatform;
};

const defaultHost = "127.0.0.1";
const defaultBackendPort = 8000;
const defaultNextPort = 3000;
const defaultWindowsPython = "C:\\Users\\Chen\\anaconda3\\python.exe";

function parsePort(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    return fallback;
  }

  return parsed;
}

function defaultPythonCommand(platform: SupportedPlatform) {
  if (platform === "win32") {
    return defaultWindowsPython;
  }

  return "python3";
}

export function createDevStackConfig(
  options: CreateDevStackConfigOptions = {},
): DevStackConfig {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const host = env.ENGGO_DEV_HOST?.trim() || defaultHost;
  const backendPort = parsePort(env.ENGGO_FASTAPI_PORT, defaultBackendPort);
  const nextPort = parsePort(env.ENGGO_NEXT_PORT, defaultNextPort);
  const explicitBackendUrl = env.ENGGO_BACKEND_URL?.trim();
  const backendUrl = explicitBackendUrl || `http://${host}:${backendPort}`;

  return {
    host,
    backendPort,
    nextPort,
    backendUrl,
    pythonCommand:
      env.ENGGO_PYTHON?.trim() || defaultPythonCommand(platform),
    backendUrlWasCustomized: Boolean(explicitBackendUrl),
  };
}

export function buildFastApiCommand(config: DevStackConfig): CommandSpec {
  return {
    command: config.pythonCommand,
    args: [
      "-m",
      "uvicorn",
      "backend.app.main:create_app",
      "--factory",
      "--host",
      config.host,
      "--port",
      String(config.backendPort),
    ],
  };
}

export function buildNextCommand(config: DevStackConfig): CommandSpec {
  return {
    command: "corepack",
    args: [
      "pnpm",
      "dev",
      "--hostname",
      config.host,
      "--port",
      String(config.nextPort),
    ],
    env: config.backendUrlWasCustomized
      ? { ENGGO_BACKEND_URL: config.backendUrl }
      : {},
  };
}

export function formatPortInUseMessage(label: string, port: number) {
  const envName = label.toLowerCase().includes("next")
    ? "ENGGO_NEXT_PORT"
    : "ENGGO_FASTAPI_PORT";

  return `${label} port ${port} is already in use. Stop that process or set ${envName}.`;
}

export function resolveSpawnSpecForPlatform(
  spec: CommandSpec,
  platform: SupportedPlatform = process.platform,
): CommandSpec {
  if (platform === "win32" && spec.command === "corepack") {
    return {
      ...spec,
      command: "cmd.exe",
      args: ["/d", "/s", "/c", spec.command, ...spec.args],
    };
  }

  return spec;
}

export async function isPortInUse(host: string, port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ host, port });

    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
  });
}
