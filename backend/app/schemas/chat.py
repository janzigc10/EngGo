from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


ExamTarget = Literal["gaokao", "cet4", "cet6", "postgrad"]
MessageRole = Literal["user", "assistant"]
AnswerKind = Literal["grounded", "plain"]


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


class ChatErrorResponse(BaseModel):
    error: ChatError
    requestId: str
    providerRequestId: str | None = None
