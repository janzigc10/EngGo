import {
  AssistantAnswer,
  AssistantLoadingAnswer,
} from "@/components/chat/assistant-answer";
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
  const lastMessage = messages[messages.length - 1];
  const showLoading = isLoading && lastMessage?.role !== "assistant";

  if (messages.length === 0) {
    return <div className="flex-1" aria-label="空对话" />;
  }

  return (
    <div className="min-w-0 flex-1 space-y-5 pb-4">
      {messages.map((message) => (
        message.role === "user" ? (
          <article
            key={message.id}
            className="ml-auto min-w-0 max-w-[84%] rounded-2xl bg-[#f1eee7] px-4 py-3 text-[#151515]"
          >
            <AnswerContent content={message.content} />
          </article>
        ) : (
          <AssistantAnswer key={message.id} message={message} />
        )
      ))}
      {showLoading ? (
        <AssistantLoadingAnswer />
      ) : null}
      {errorMessage ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {errorMessage}
        </div>
      ) : null}
    </div>
  );
}
