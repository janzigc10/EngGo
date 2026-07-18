from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.app.api.chat import router as chat_router
from backend.app.answering.advanced_lookup import AdvancedLookupService
from backend.app.answering.direct_compare import DirectCompareService
from backend.app.answering.ordinary_lookup import OrdinaryLookupService
from backend.app.answering.provider import OpenAiChatProvider
from backend.app.content.compact_exam_wordbook import CompactExamWordbookLoader
from backend.app.content.ecdict import create_ecdict_basic_profile_lookup
from backend.app.core.config import load_settings
from backend.app.core.request_id import create_request_id
from backend.app.retrieval.repository import (
    NullStructuredLookupRepository,
    StructuredLookupRepository,
)
from backend.app.retrieval.spelling_candidates import (
    EcdictSpellingCandidateProvider,
)
from backend.app.retrieval.spelling_decision import SpellingDecisionPolicy
from backend.app.retrieval.retrieval_trace import (
    JsonlRetrievalTraceSink,
    NullRetrievalTraceSink,
)
from backend.app.schemas.chat import ChatError, ChatErrorResponse


def create_app(
    ordinary_lookup_service=None,
    direct_compare_service=None,
    advanced_lookup_service=None,
    retrieval_trace_sink=None,
) -> FastAPI:
    settings = load_settings()
    app = FastAPI(title="EngGo FastAPI Backend")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_allow_origins),
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type"],
    )
    app.state.ordinary_lookup_service = ordinary_lookup_service
    app.state.direct_compare_service = direct_compare_service
    app.state.advanced_lookup_service = advanced_lookup_service
    if retrieval_trace_sink is not None:
        app.state.retrieval_trace_sink = retrieval_trace_sink
    elif settings.retrieval_trace_jsonl_path is not None:
        app.state.retrieval_trace_sink = JsonlRetrievalTraceSink(
            settings.retrieval_trace_jsonl_path,
        )
    else:
        app.state.retrieval_trace_sink = NullRetrievalTraceSink()
    app.state.retrieval_trace_include_raw_query = (
        settings.retrieval_trace_include_raw_query
    )
    app.state.retrieval_trace_environment = {
        "name": settings.environment,
        "structuredRuntime": bool(
            settings.use_structured_runtime and settings.database_url,
        ),
        "providerMode": "configured" if settings.openai_api_key else "off",
        "buildVersion": settings.build_version,
        "dataVersion": settings.data_version,
    }

    repository = (
        StructuredLookupRepository(database_url=settings.database_url)
        if settings.use_structured_runtime and settings.database_url
        else NullStructuredLookupRepository()
    )

    provider = OpenAiChatProvider(
        api_key=settings.openai_api_key,
        base_url=settings.openai_base_url,
        model=settings.openai_model or "gpt-5.4",
    )
    app.state.provider = provider
    ecdict_lookup = create_ecdict_basic_profile_lookup(
        dictionary_path=settings.ecdict_dictionary_path,
    )
    spelling_candidate_provider = EcdictSpellingCandidateProvider(
        ecdict_lookup=ecdict_lookup,
        compact_wordbook_loader=CompactExamWordbookLoader(
            path=(
                settings.source_lemma_base_dir
                / "ecdict-wordbook"
                / "entries.json"
            ),
        ),
    )
    spelling_decision_policy = SpellingDecisionPolicy()
    app.state.spelling_candidate_provider = spelling_candidate_provider
    app.state.spelling_decision_policy = spelling_decision_policy

    if app.state.ordinary_lookup_service is None:
        app.state.ordinary_lookup_service = OrdinaryLookupService(
            repository=repository,
            source_lemma_base_dir=settings.source_lemma_base_dir,
            ecdict_lookup=ecdict_lookup,
            provider=provider,
            spelling_candidate_provider=spelling_candidate_provider,
            spelling_decision_policy=spelling_decision_policy,
        )

    if app.state.direct_compare_service is None:
        app.state.direct_compare_service = DirectCompareService(
            repository=repository,
            provider=provider,
            source_lemma_base_dir=settings.source_lemma_base_dir,
            ecdict_lookup=ecdict_lookup,
        )

    if app.state.advanced_lookup_service is None:
        app.state.advanced_lookup_service = AdvancedLookupService(
            repository=repository,
            provider=provider,
            source_lemma_base_dir=settings.source_lemma_base_dir,
            ecdict_lookup=ecdict_lookup,
        )

    @app.middleware("http")
    async def attach_request_id(request: Request, call_next):
        request.state.request_id = create_request_id()
        response = await call_next(request)
        response.headers.setdefault("x-request-id", request.state.request_id)
        return response

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        request: Request,
        exc: RequestValidationError,
    ) -> JSONResponse:
        request_id = getattr(request.state, "request_id", create_request_id())
        payload = ChatErrorResponse(
            error=ChatError(
                code="invalid_request",
                message="请求体格式不正确。",
                details=exc.errors(),
            ),
            requestId=request_id,
            providerRequestId=None,
        )

        content = payload.model_dump()

        return JSONResponse(
            status_code=400,
            content=content,
            headers={"x-request-id": request_id},
        )

    @app.get("/health")
    def health() -> dict[str, str]:
        return {
            "status": "ok",
            "service": settings.app_name,
        }

    app.include_router(chat_router)

    return app
