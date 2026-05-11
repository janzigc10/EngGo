import { describe, expect, test } from "vitest";

import {
  buildFastApiCommand,
  buildNextCommand,
  createDevStackConfig,
  formatPortInUseMessage,
  resolveSpawnSpecForPlatform,
} from "./dev-fastapi-stack";

describe("dev FastAPI stack helpers", () => {
  test("builds the default FastAPI command with the app factory", () => {
    const config = createDevStackConfig({
      platform: "win32",
      env: {},
    });

    expect(config.backendUrl).toBe("http://127.0.0.1:8000");
    expect(buildFastApiCommand(config)).toEqual({
      command: "C:\\Users\\Chen\\anaconda3\\python.exe",
      args: [
        "-m",
        "uvicorn",
        "backend.app.main:create_app",
        "--factory",
        "--host",
        "127.0.0.1",
        "--port",
        "8000",
      ],
    });
  });

  test("uses ENGGO_PYTHON and port overrides when provided", () => {
    const config = createDevStackConfig({
      platform: "linux",
      env: {
        ENGGO_PYTHON: "/opt/python/bin/python",
        ENGGO_FASTAPI_PORT: "8010",
        ENGGO_NEXT_PORT: "3010",
      },
    });

    expect(config.backendPort).toBe(8010);
    expect(config.nextPort).toBe(3010);
    expect(config.backendUrl).toBe("http://127.0.0.1:8010");
    expect(buildFastApiCommand(config).command).toBe("/opt/python/bin/python");
  });

  test("builds the Next command without forcing ENGGO_BACKEND_URL", () => {
    const config = createDevStackConfig({
      platform: "win32",
      env: {},
    });

    expect(buildNextCommand(config)).toEqual({
      command: "corepack",
      args: ["pnpm", "dev", "--hostname", "127.0.0.1", "--port", "3000"],
      env: {},
    });
  });

  test("passes ENGGO_BACKEND_URL only when the backend URL is customized", () => {
    const config = createDevStackConfig({
      platform: "win32",
      env: {
        ENGGO_BACKEND_URL: "http://127.0.0.1:8010",
      },
    });

    expect(config.backendUrl).toBe("http://127.0.0.1:8010");
    expect(buildNextCommand(config).env).toEqual({
      ENGGO_BACKEND_URL: "http://127.0.0.1:8010",
    });
  });

  test("formats a useful port-in-use message", () => {
    expect(formatPortInUseMessage("Next", 3000)).toBe(
      "Next port 3000 is already in use. Stop that process or set ENGGO_NEXT_PORT.",
    );
  });

  test("wraps Windows command shims without requiring shell=true", () => {
    expect(
      resolveSpawnSpecForPlatform(
        { command: "corepack", args: ["pnpm", "dev"] },
        "win32",
      ),
    ).toEqual({
      command: "cmd.exe",
      args: ["/d", "/s", "/c", "corepack", "pnpm", "dev"],
    });

    expect(
      resolveSpawnSpecForPlatform(
        { command: "corepack", args: ["pnpm", "dev"] },
        "linux",
      ),
    ).toEqual({ command: "corepack", args: ["pnpm", "dev"] });

    expect(
      resolveSpawnSpecForPlatform(
        { command: "python3", args: ["-m", "uvicorn"] },
        "win32",
      ),
    ).toEqual({ command: "python3", args: ["-m", "uvicorn"] });
  });
});
