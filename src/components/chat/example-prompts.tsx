type ExamplePromptsProps = {
  prompts: string[];
  onSelect: (prompt: string) => void;
};

export function ExamplePrompts({ prompts, onSelect }: ExamplePromptsProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {prompts.map((prompt) => (
        <button
          key={prompt}
          type="button"
          onClick={() => onSelect(prompt)}
          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left text-sm font-medium text-slate-700 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-900"
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}
