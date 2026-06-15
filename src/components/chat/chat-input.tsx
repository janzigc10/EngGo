import { examTargets, type ExamTargetCode } from "@/features/exam-target/model";

type ChatInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  activeExamTarget: ExamTargetCode;
  onExamTargetChange: (value: ExamTargetCode) => void;
};

export function ChatInput({
  value,
  onChange,
  onSubmit,
  isLoading,
  activeExamTarget,
  onExamTargetChange,
}: ChatInputProps) {
  const activeExamTargetLabel =
    examTargets.find((target) => target.code === activeExamTarget)?.label ?? "CET-6";

  return (
    <div className="mt-4">
      <div className="rounded-2xl border border-[#dedacf] bg-white p-3 shadow-[0_18px_48px_rgba(21,21,21,0.10)]">
        <textarea
          id="chat-input"
          data-testid="chat-input"
          className="max-h-56 min-h-24 w-full resize-none border-0 bg-transparent px-2 py-2 text-base leading-7 text-[#151515] outline-none ring-0 placeholder:text-[#8f8f86]"
          placeholder="问点什么"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();

              if (!isLoading) {
                onSubmit();
              }
            }
          }}
        />
        <div className="mt-2 flex items-center justify-between gap-3 border-t border-[#eeeae0] pt-3">
          <div className="flex min-w-0 items-center gap-2 text-xs text-[#6f6f68]">
            <span
              data-testid="active-exam-target"
              className="shrink-0 font-medium text-[#151515]"
            >
              {activeExamTargetLabel}
            </span>
            <label htmlFor="exam-target-select" className="sr-only">
              当前词书
            </label>
            <select
              id="exam-target-select"
              aria-label="当前词书"
              value={activeExamTarget}
              onChange={(event) => {
                const next = event.target.value;

                if (next === "gaokao" || next === "cet4" || next === "cet6" || next === "postgrad") {
                  onExamTargetChange(next);
                }
              }}
              className="max-w-28 rounded-lg border border-transparent bg-transparent px-1 py-1 text-xs font-medium text-[#6f6f68] outline-none transition hover:border-[#dedacf] focus:border-[#d08a18]"
            >
              {examTargets.map((target) => (
                <option key={target.code} value={target.code}>
                  {target.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isLoading}
            className="shrink-0 rounded-xl bg-[#151515] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#2a2a28] disabled:cursor-wait disabled:bg-[#6f6f68]"
          >
            {isLoading ? "发送中" : "发送"}
          </button>
        </div>
      </div>
    </div>
  );
}
