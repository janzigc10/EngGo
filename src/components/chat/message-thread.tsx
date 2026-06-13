import { AnswerContent } from "@/components/chat/answer-content";
import type { ChatMessage } from "@/features/chat/types";

type MessageThreadProps = {
  messages: ChatMessage[];
  errorMessage: string | null;
  isLoading: boolean;
};

export function MessageThread({
  messages,
  errorMessage,
  isLoading,
}: MessageThreadProps) {
  if (messages.length === 0) {
    return <div className="flex-1" aria-label="空对话" />;
  }

  return (
    <div className="min-w-0 flex-1 space-y-6 pb-4">
      {messages.map((message) => (
        <article
          key={message.id}
          className={`min-w-0 ${
            message.role === "user"
              ? "ml-auto max-w-[82%] rounded-2xl bg-[#f1eee7] px-4 py-3 text-[#151515]"
              : "text-[#151515]"
          }`}
        >
          <AnswerContent content={message.content} />
        </article>
      ))}
      {isLoading ? (
        <div
          aria-live="polite"
          className="px-1 py-2 text-sm text-[#6f6f68]"
        >
          正在思考...
        </div>
      ) : null}
      {errorMessage ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {errorMessage}
        </div>
      ) : null}
    </div>
  );
}
