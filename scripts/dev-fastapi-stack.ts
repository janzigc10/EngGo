import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import http from "node:http";

import {
  buildFastApiCommand,
  buildNextCommand,
  createDevStackConfig,
  formatPortInUseMessage,
  isPortInUse,
  resolveSpawnSpecForPlatform,
  type CommandSpec,
} from "./lib/dev-fastapi-stack";

type ManagedProcess = {
  label: string;
  child: ChildProcessWithoutNullStreams;
};

const healthTimeoutMs = Number(process.env.ENGGO_FASTAPI_HEALTH_TIMEOUT_MS ?? 30_000);

function prefixOutput(label: string, child: ChildProcessWithoutNullStreams) {
  child.stdout.on("data", (chunk: Buffer) => {
    process.stdout.write(`[${label}] ${chunk.toString()}`);
  });
  child.stderr.on("data", (chunk: Buffer) => {
    process.stderr.write(`[${label}] ${chunk.toString()}`);
  });
}

function spawnCommand(label: string, spec: CommandSpec): ManagedProcess {
  const spawnSpec = resolveSpawnSpecForPlatform(spec);
  const child = spawn(spawnSpec.command, spawnSpec.args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...(spawnSpec.env ?? {}),
    },
  });

  prefixOutput(label, child);

  child.once("exit", (code, signal) => {
    if (code !== null && code !== 0) {
      process.stderr.write(`[${label}] exited with code ${code}\n`);
    }
    if (signal) {
      process.stderr.write(`[${label}] exited with signal ${signal}\n`);
    }
  });

  return { label, child };
}

function requestHealth(url: string) {
  return new Promise<boolean>((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });

    request.once("error", () => resolve(false));
    request.setTimeout(1_000, () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function waitForHealth(url: string, timeoutMs: number) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await requestHealth(url)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`FastAPI health check did not pass at ${url}`);
}

async function main() {
  const config = createDevStackConfig();
  const healthUrl = `${config.backendUrl.replace(/\/+$/, "")}/health`;

  if (await isPortInUse(config.host, config.backendPort)) {
    throw new Error(formatPortInUseMessage("FastAPI", config.backendPort));
  }
  if (await isPortInUse(config.host, config.nextPort)) {
    throw new Error(formatPortInUseMessage("Next", config.nextPort));
  }

  process.stdout.write(
    [
      "Starting EngGo FastAPI dev stack",
      `FastAPI: ${config.backendUrl}`,
      `Next: http://${config.host}:${config.nextPort}`,
      "Press Ctrl+C to stop both processes.",
      "",
    ].join("\n"),
  );

  const processes: ManagedProcess[] = [];

  const shutdown = () => {
    for (const managed of processes) {
      if (!managed.child.killed) {
        managed.child.kill();
      }
    }
  };

  process.once("SIGINT", () => {
    shutdown();
    process.exit(0);
  });
  process.once("SIGTERM", () => {
    shutdown();
    process.exit(0);
  });
  process.once("exit", shutdown);

  const fastApi = spawnCommand("fastapi", buildFastApiCommand(config));
  processes.push(fastApi);

  await waitForHealth(healthUrl, healthTimeoutMs);
  process.stdout.write(`FastAPI health check passed at ${healthUrl}\n`);

  const next = spawnCommand("next", buildNextCommand(config));
  processes.push(next);

  await new Promise<void>((resolve) => {
    for (const managed of processes) {
      managed.child.once("exit", () => resolve());
    }
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
