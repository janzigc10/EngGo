import { describe, expect, it } from "vitest";

import { findRootFamilyPrototype } from "@/features/retrieval/root-family-prototypes";

describe("findRootFamilyPrototype", () => {
  it("matches the stitute fragment prototype", () => {
    expect(findRootFamilyPrototype("stitute 是什么")?.id).toBe("root-stitute");
  });

  it("matches the tempt family prototype", () => {
    expect(findRootFamilyPrototype("tempt 这一族怎么记")?.id).toBe("root-tempt");
  });

  it("matches a known member when the user asks for its family", () => {
    expect(findRootFamilyPrototype("attempt 这一族怎么记")?.id).toBe("root-tempt");
    expect(findRootFamilyPrototype("institute 这种同根词怎么记")?.id).toBe("root-stitute");
    expect(findRootFamilyPrototype("跟 institute 一样那几个词怎么记")?.id).toBe("root-stitute");
  });

  it("keeps unsupported prefix combinations unresolved", () => {
    expect(findRootFamilyPrototype("re+con 的词根有什么词")).toBeNull();
  });

  it("marks tempt as a family that should not be over-fitted", () => {
    expect(findRootFamilyPrototype("tempt 这一族怎么记")?.caution).toContain("不要硬套");
  });
});
