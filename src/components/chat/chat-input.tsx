type ChatInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
};

export function ChatInput({
  value,
  onChange,
  onSubmit,
  isLoading,
}: ChatInputProps) {
  return (
    <div className="space-y-4 pt-8">
      <label htmlFor="chat-input" className="text-sm font-medium text-slate-700">
        试着输入中文意思、半截拼写，或者直接问两个词的区别
      </label>
      <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-3 shadow-inner shadow-slate-200/50">
        <textarea
          id="chat-input"
          data-testid="chat-input"
          className="min-h-32 w-full resize-none rounded-[1.25rem] border-0 bg-white px-4 py-4 text-base leading-7 text-slate-900 outline-none ring-0 placeholder:text-slate-400"
          placeholder="比如：遵从怎么说"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-sm text-slate-500">
            回答会优先锁定当前考试范围内的主答案，再补易混边界。
          </p>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isLoading}
            className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isLoading ? "回答生成中..." : "开始提问"}
          </button>
        </div>
      </div>
    </div>
  );
}
