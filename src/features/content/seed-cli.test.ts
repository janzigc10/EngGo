import { afterEach, describe, expect, it, vi } from "vitest";

function createSeedModuleMocks() {
  const loadSeedContent = vi.fn(async () => ({
    entries: [],
    confusionGroups: [],
  }));
  const loadVocabContent = vi.fn(async () => ({
    entries: [],
    confusionGroups: [],
  }));
  const seedContent = vi.fn(async () => undefined);
  const disconnect = vi.fn(async () => undefined);
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

  vi.doMock("@/features/content/load-seed-content", () => ({
    loadSeedContent,
    loadVocabContent,
  }));
  vi.doMock("@/features/content/seed-content", () => ({
    seedContent,
  }));
  vi.doMock("@/lib/db", () => ({
    db: {
      $disconnect: disconnect,
    },
  }));

  return {
    error,
    loadSeedContent,
    loadVocabContent,
    seedContent,
  };
}

async function importSeedWithArgv(argv: string[]) {
  const previousArgv = process.argv;
  process.argv = argv;

  try {
    await import("../../../prisma/seed");
  } finally {
    process.argv = previousArgv;
  }
}

describe("prisma seed CLI", () => {
  afterEach(() => {
    process.exitCode = undefined;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("uses the seed-specific loader when no dataset is provided", async () => {
    const mocks = createSeedModuleMocks();

    await importSeedWithArgv(["node", "prisma/seed.ts"]);

    expect(mocks.loadSeedContent).toHaveBeenCalledTimes(1);
    expect(mocks.loadVocabContent).not.toHaveBeenCalled();
    expect(mocks.seedContent).toHaveBeenCalledWith(expect.anything(), {
      entries: [],
      confusionGroups: [],
    });
  });

  it("uses the generic dataset loader when a dataset is provided", async () => {
    const mocks = createSeedModuleMocks();

    await importSeedWithArgv(["node", "prisma/seed.ts", "--dataset", "real-smoke"]);

    expect(mocks.loadSeedContent).not.toHaveBeenCalled();
    expect(mocks.loadVocabContent).toHaveBeenCalledWith({
      datasetName: "real-smoke",
    });
  });

  it("reports a clear error when dataset is missing a value", async () => {
    const mocks = createSeedModuleMocks();

    await importSeedWithArgv(["node", "prisma/seed.ts", "--dataset"]);

    expect(mocks.error).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Missing dataset name after --dataset. Example: --dataset real-smoke",
      }),
    );
    expect(mocks.seedContent).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});
