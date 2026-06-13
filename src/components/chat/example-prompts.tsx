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
          className="rounded-xl border border-[#e5e1d7] bg-[#f8f8f6] px-4 py-4 text-left text-sm font-semibold text-[#151515] transition hover:border-[#d08a18] hover:bg-[#fbfaf7]"
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}
