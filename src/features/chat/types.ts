import type { AnswerGrounding } from "@/features/answering/build-grounding";

export type ChatHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatMessage = ChatHistoryMessage & {
  id: string;
  answerKind?: "grounded" | "plain";
  grounding?: AnswerGrounding;
  requestId?: string;
  providerRequestId?: string | null;
};

export type ChatApiSuccessResponse = {
  answer: string;
  answerKind?: "grounded" | "plain";
  grounding?: AnswerGrounding;
  requestId: string;
  providerRequestId: string | null;
};
