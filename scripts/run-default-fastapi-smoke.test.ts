import { describe, expect, test } from "vitest";

import {
  buildDefaultFastApiSmokeCommands,
  formatDefaultFastApiSmokeBanner,
  isDirectRun,
  resolveSmokeCommandForSpawn,
} from "./run-default-fastapi-smoke";

describe("default FastAPI smoke command", () => {
  test("runs the direct FastAPI smoke commands", () => {
    expect(buildDefaultFastApiSmokeCommands()).toEqual([
      ["corepack", "pnpm", "eval:fastapi:conversation-context-smoke"],
    ]);
  });

  test("prints the direct FastAPI route being verified", () => {
    expect(formatDefaultFastApiSmokeBanner()).toContain(
      "FastAPI direct http://127.0.0.1:8000/api/chat",
    );
  });

  test("detects direct execution under tsx", () => {
    expect(
      isDirectRun(
        "file:///C:/Users/Chen/Desktop/EngGo/scripts/run-default-fastapi-smoke.ts",
        "C:\\Users\\Chen\\Desktop\\EngGo\\scripts\\run-default-fastapi-smoke.ts",
      ),
    ).toBe(true);
  });

  test("wraps Windows command shims on the real execution path", () => {
    expect(
      resolveSmokeCommandForSpawn(
        ["corepack", "pnpm", "eval:product-smoke:http"],
        "win32",
      ),
    ).toEqual({
      command: "cmd.exe",
      args: [
        "/d",
        "/s",
        "/c",
        "corepack",
        "pnpm",
        "eval:product-smoke:http",
      ],
    });
  });
});
