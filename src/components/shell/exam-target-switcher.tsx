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
        className="inline-flex w-fit items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-900"
        data-testid="active-exam-target"
      >
        <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />
        当前考试范围：{examTargets.find((target) => target.code === activeExamTarget)?.label}
      </div>
      <div className="flex flex-wrap gap-2">
        {examTargets.map((target) => {
          const isActive = target.code === activeExamTarget;

          return (
            <button
              key={target.code}
              type="button"
              onClick={() => onChange(target.code)}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                isActive
                  ? "border-slate-950 bg-slate-950 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:text-sky-900"
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
