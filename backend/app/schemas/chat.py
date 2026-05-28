from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


ExamTarget = Literal["gaokao", "cet4", "cet6", "postgrad"]
MessageRole = Literal["user", "assistant"]
AnswerKind = Literal["grounded", "plain"]


class LearningCandidateRef(BaseModel):
    index: int
    lemma: str
    label: str
    entryId: str | None = None
    sourceKind: str | None = None
    partOfSpeech: str | None = None
    meaningZh: str | None = None
    reviewStatus: str | None = None


class LearningFocus(BaseModel):
    kind: Literal["lemma", "phrase", "candidate_group", "meaning_candidate"]
    label: str
    lemma: str | None = None
    index: int | None = None


class ConversationalLearningContext(BaseModel):
    version: Literal[1] = 1
    activeExamTarget: ExamTarget
    sourceMessageId: str
    topicKind: str
    sourceQuery: str | None = None
    focus: LearningFocus | None = None
    candidates: list[LearningCandidateRef] = Field(default_factory=list)
    continuationCandidates: list[LearningCandidateRef] = Field(default_factory=list)
    availableActions: list[str] = Field(default_factory=list)
    expiresAfterTurns: int = 2


class ChatHistoryMessage(BaseModel):
    role: MessageRole
    content: str = Field(min_length=1)

    @field_validator("content")
    @classmethod
    def strip_content(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("message content is required")
        return stripped


class ChatRequest(BaseModel):
    activeExamTarget: ExamTarget
    query: str = Field(min_length=1)
    history: list[ChatHistoryMessage] = Field(default_factory=list)
    conversationContext: ConversationalLearningContext | None = None

    @field_validator("query")
    @classmethod
    def strip_query(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("query is required")
        return stripped


class ChatError(BaseModel):
    code: str
    message: str
    details: Any | None = None


class ChatSuccessResponse(BaseModel):
    answer: str
    answerKind: AnswerKind | None = None
    grounding: dict[str, Any] | None = None
    requestId: str
    providerRequestId: str | None = None
    conversationContext: ConversationalLearningContext | None = None
    resolvedFollowUp: dict[str, Any] | None = None


class ChatErrorResponse(BaseModel):
    error: ChatError
    requestId: str
    providerRequestId: str | None = None
