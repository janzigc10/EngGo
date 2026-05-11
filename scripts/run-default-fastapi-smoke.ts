import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  resolveSpawnSpecForPlatform,
  type CommandSpec,
  type SupportedPlatform,
} from "./lib/dev-fastapi-stack";

export type SmokeCommand = [command: string, ...args: string[]];

export function buildDefaultFastApiSmokeCommands(): SmokeCommand[] {
  return [
    ["corepack", "pnpm", "eval:fastapi:migrated-smoke:proxy"],
    ["corepack", "pnpm", "eval:product-smoke:http:proxy"],
  ];
}

export function formatDefaultFastApiSmokeBanner() {
  return [
    "=== DEFAULT FASTAPI SMOKE ===",
    "Verifying: Next /api/chat -> FastAPI http://127.0.0.1:8000",
    "Prerequisite: run `corepack pnpm dev:fastapi` in another terminal.",
    "",
  ].join("\n");
}

export function isDirectRun(moduleUrl: string, argvPath: string | undefined) {
  if (!argvPath) {
    return false;
  }

  return path.resolve(argvPath) === fileURLToPath(moduleUrl);
}

export function resolveSmokeCommandForSpawn(
  command: SmokeCommand,
  platform: SupportedPlatform = process.platform,
): CommandSpec {
  const [executable, ...args] = command;
  return resolveSpawnSpecForPlatform({ command: executable, args }, platform);
}

function runCommand(command: SmokeCommand) {
  return new Promise<void>((resolve, reject) => {
    const spawnSpec = resolveSmokeCommandForSpawn(command);
    const child = spawn(spawnSpec.command, spawnSpec.args, {
      cwd: process.cwd(),
      stdio: "inherit",
    });

    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command.join(" ")} exited with code ${code}`));
    });
    child.once("error", reject);
  });
}

async function main() {
  process.stdout.write(formatDefaultFastApiSmokeBanner());

  for (const command of buildDefaultFastApiSmokeCommands()) {
    await runCommand(command);
  }
}

if (isDirectRun(import.meta.url, process.argv[1])) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}
