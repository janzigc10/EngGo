import { describe, expect, it } from "vitest";

import {
  getEcdictTagsForExamScope,
  getExamScopeClosure,
  hasScopeInExamTargetClosure,
  scopeCodesFromEcdictTags,
} from "@/features/exam-target/scope-closure";

describe("exam scope closure", () => {
  it("inherits lower-level wordbook scopes", () => {
    expect(getExamScopeClosure("gaokao")).toEqual(["gaokao"]);
    expect(getExamScopeClosure("cet4")).toEqual(["gaokao", "cet4"]);
    expect(getExamScopeClosure("cet6")).toEqual(["gaokao", "cet4", "cet6"]);
    expect(getExamScopeClosure("postgrad")).toEqual([
      "gaokao",
      "cet4",
      "cet6",
      "postgrad",
    ]);
  });

  it("maps ECDICT tags to direct scopes but tests membership by closure", () => {
    expect(scopeCodesFromEcdictTags("gk cet4 ky")).toEqual([
      "gaokao",
      "cet4",
      "postgrad",
    ]);
    expect(getEcdictTagsForExamScope("cet6")).toEqual(["gk", "zk", "cet4", "cet6"]);
    expect(hasScopeInExamTargetClosure(["gaokao", "cet4"], "cet6")).toBe(true);
    expect(hasScopeInExamTargetClosure(["cet6"], "cet4")).toBe(false);
  });
});
