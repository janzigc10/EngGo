export const examTargets = [
  { code: "gaokao", label: "高考" },
  { code: "cet4", label: "CET-4" },
  { code: "cet6", label: "CET-6" },
  { code: "postgrad", label: "考研" },
] as const;

export type ExamTargetCode = (typeof examTargets)[number]["code"];

export const defaultExamTarget: ExamTargetCode = "cet6";

export function isExamTargetCode(value: string): value is ExamTargetCode {
  return examTargets.some((target) => target.code === value);
}

export function getExamTargetLabel(code: ExamTargetCode) {
  return (
    examTargets.find((target) => target.code === code)?.label ?? "未设置考试范围"
  );
}
