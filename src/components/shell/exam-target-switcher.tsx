"use client";

import { examTargets, type ExamTargetCode } from "@/features/exam-target/model";

type ExamTargetSwitcherProps = {
  activeExamTarget: ExamTargetCode;
  onChange: (nextExamTarget: ExamTargetCode) => void;
};

export function ExamTargetSwitcher({
  activeExamTarget,
  onChange,
}: ExamTargetSwitcherProps) {
  return (
    <div className="space-y-3">
      <div
        className="inline-flex w-fit items-center gap-2 rounded-xl border border-[#e5e1d7] bg-[#fbfaf7] px-4 py-2 text-sm font-semibold text-[#151515]"
        data-testid="active-exam-target"
      >
        <span className="h-2.5 w-2.5 rounded-full bg-[#d08a18]" />
        当前词书：{examTargets.find((target) => target.code === activeExamTarget)?.label}
      </div>
      <div className="flex flex-wrap gap-2">
        {examTargets.map((target) => {
          const isActive = target.code === activeExamTarget;

          return (
            <button
              key={target.code}
              type="button"
              onClick={() => onChange(target.code)}
              className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${
                isActive
                  ? "border-[#151515] bg-[#151515] text-white"
                  : "border-[#e5e1d7] bg-white text-[#6f6f68] hover:border-[#d08a18] hover:bg-[#fbfaf7] hover:text-[#151515]"
              }`}
            >
              {target.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
