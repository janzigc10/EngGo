from dataclasses import replace

import pytest


def test_spelling_candidate_provider_keeps_distance_ahead_of_scope_and_reports_signals():
    from backend.app.retrieval.spelling_candidates import (
        EcdictSpellingCandidateProvider,
        SpellingLexicon,
    )

    lexicon = SpellingLexicon(
        global_lemmas=("access", "across", "request"),
        direct_scope_codes_by_lemma={
            "across": ("cet4",),
            "request": ("cet4",),
        },
        source_version="fixture-v1",
    )
    provider = EcdictSpellingCandidateProvider(lexicon=lexicon)

    result = provider.generate(
        term="acess",
        active_exam_target="cet4",
        limit=3,
    )

    assert result.status == "ready"
    assert result.input_is_known_word is False
    assert result.global_competition_complete is True
    assert result.lexicon_version == "fixture-v1"
    assert [candidate.lemma for candidate in result.candidates[:2]] == [
        "access",
        "across",
    ]

    global_winner, scoped_runner_up = result.candidates[:2]
    assert global_winner.edit_distance == 1
    assert global_winner.in_active_exam_scope is False
    assert "global_competitor" in global_winner.reason_codes
    assert scoped_runner_up.in_active_exam_scope is True
    assert "active_exam_scope" in scoped_runner_up.reason_codes
    assert global_winner.rank_key[0] == global_winner.edit_distance
    assert scoped_runner_up.rank_key[0] == scoped_runner_up.edit_distance

    transposition = provider.generate(
        term="reqeust",
        active_exam_target="cet4",
        limit=3,
    )
    request_candidate = next(
        candidate
        for candidate in transposition.candidates
        if candidate.lemma == "request"
    )
    assert request_candidate.edit_distance == 1


def test_spelling_decision_policy_separates_auto_clarify_and_safe_rejection():
    from backend.app.retrieval.spelling_candidates import (
        SpellingCandidate,
        SpellingCandidateResult,
    )
    from backend.app.retrieval.spelling_decision import (
        SpellingDecisionPolicy,
        SpellingDecisionThresholds,
    )

    def candidate(lemma: str, *, distance: int, in_scope: bool) -> SpellingCandidate:
        return SpellingCandidate(
            lemma=lemma,
            edit_distance=distance,
            in_active_exam_scope=in_scope,
            scope_codes=("cet4",) if in_scope else (),
            source_kind="compact_wordbook" if in_scope else "ecdict",
            reason_codes=(
                f"edit_distance_{distance}",
                "active_exam_scope" if in_scope else "global_competitor",
            ),
            rank_key=(distance, 0 if in_scope else 1, lemma),
        )

    policy = SpellingDecisionPolicy(
        thresholds=SpellingDecisionThresholds(
            auto_correct_max_distance=1,
            clarification_max_distance=2,
            min_distance_margin=1,
            max_clarification_candidates=3,
        ),
    )
    request = candidate("request", distance=1, in_scope=True)
    auto_result = SpellingCandidateResult(
        term="reqeust",
        status="ready",
        input_is_known_word=False,
        global_competition_complete=True,
        candidates=(request,),
        lexicon_version="fixture-v1",
    )

    auto = policy.decide(term="reqeust", result=auto_result)
    assert auto.kind == "auto_correct"
    assert [item.lemma for item in auto.candidates] == ["request"]
    assert auto.reason_code == "high_confidence"

    ambiguous_result = replace(
        auto_result,
        term="frorm",
        candidates=(
            candidate("form", distance=1, in_scope=True),
            candidate("farm", distance=1, in_scope=True),
            candidate("firm", distance=1, in_scope=False),
            candidate("foam", distance=2, in_scope=True),
        ),
    )
    ambiguous = policy.decide(term="frorm", result=ambiguous_result)
    assert ambiguous.kind == "clarify_candidates"
    assert [item.lemma for item in ambiguous.candidates] == [
        "form",
        "farm",
        "firm",
    ]
    assert ambiguous.reason_code == "ambiguous_candidates"

    valid_word = policy.decide(
        term="request",
        result=replace(auto_result, term="request", input_is_known_word=True),
    )
    assert valid_word.kind == "no_reliable_candidate"
    assert valid_word.candidates == ()
    assert valid_word.reason_code == "valid_word"

    incomplete = policy.decide(
        term="reqeust",
        result=replace(auto_result, global_competition_complete=False),
    )
    assert incomplete.kind == "no_reliable_candidate"
    assert incomplete.reason_code == "global_competition_incomplete"

    unavailable = policy.decide(
        term="reqeust",
        result=replace(auto_result, status="candidate_source_unavailable"),
    )
    assert unavailable.kind == "no_reliable_candidate"
    assert unavailable.reason_code == "candidate_source_unavailable"

    random_like = policy.decide(
        term="xqzplm",
        result=replace(
            auto_result,
            term="xqzplm",
            candidates=(candidate("example", distance=2, in_scope=True),),
        ),
    )
    assert random_like.kind == "no_reliable_candidate"
    assert random_like.reason_code == "random_like"


def test_needs_clarification_reuses_candidate_surface_and_builds_spelling_context():
    from backend.app.conversation.learning_context import build_conversation_context
    from backend.app.schemas.chat import ChatSuccessResponse

    candidates = [
        {
            "entryId": "external-dictionary-basic:access",
            "lemma": "access",
            "meaningsZh": ["n. 进入；使用权"],
            "matchedAlias": None,
            "scopeCodes": ["cet4"],
            "inScope": True,
            "reason": "spelling candidate",
            "score": 0,
            "sourceKind": "external_dictionary_basic",
        },
        {
            "entryId": "external-dictionary-basic:assess",
            "lemma": "assess",
            "meaningsZh": ["v. 评估"],
            "matchedAlias": None,
            "scopeCodes": ["cet4"],
            "inScope": True,
            "reason": "spelling candidate",
            "score": 0,
            "sourceKind": "external_dictionary_basic",
        },
    ]
    payload = ChatSuccessResponse(
        answer="这个拼写有多个合理候选，请选一个。",
        answerKind="grounded",
        grounding={
            "activeExamTarget": "cet4",
            "activeExamTargetLabel": "四级",
            "query": "acess 是什么意思",
            "queryMode": "fuzzy_recall",
            "answerStyle": "standard_lookup",
            "resolution": "needs_clarification",
            "noMatchReason": None,
            "matchType": None,
            "mainAnswer": [],
            "confusionBoundary": [],
            "scopeReminder": "",
            "followUpPrompt": "请选择一个候选。",
            "comparisonView": None,
            "rootFamilyView": None,
            "spellingDecision": "clarify_candidates",
            "candidates": candidates,
        },
        requestId="req_spelling_clarification",
        providerRequestId=None,
    )

    assert payload.answerSurface is not None
    assert payload.answerSurface["type"] == "candidate_list"
    assert [item["lemma"] for item in payload.answerSurface["items"]] == [
        "access",
        "assess",
    ]

    context = build_conversation_context(
        payload=payload,
        active_exam_target="cet4",
        source_message_id="req_spelling_clarification:assistant",
    )
    assert context is not None
    assert context.topicKind == "spelling_clarification"
    assert [candidate.lemma for candidate in context.candidates] == [
        "access",
        "assess",
    ]


def test_bare_ordinal_selects_only_inside_spelling_clarification_context():
    from backend.app.conversation.learning_context import resolve_follow_up
    from backend.app.schemas.chat import (
        ConversationalLearningContext,
        LearningCandidateRef,
    )

    candidates = [
        LearningCandidateRef(index=1, lemma="access", label="access"),
        LearningCandidateRef(index=2, lemma="assess", label="assess"),
    ]

    def context(topic_kind: str) -> ConversationalLearningContext:
        return ConversationalLearningContext(
            activeExamTarget="cet4",
            sourceMessageId="assistant_spelling_candidates",
            topicKind=topic_kind,
            sourceQuery="acess 是什么意思",
            candidates=candidates,
            availableActions=["context_choice"],
        )

    selected = resolve_follow_up(
        "第一个",
        context("spelling_clarification"),
        "cet4",
    )
    assert selected["kind"] == "resolved_query"
    assert selected["query"] == "access"
    assert selected["reason"] == "spelling_candidate_selection"
    assert [item["lemma"] for item in selected["targetRefs"]] == ["access"]

    assert resolve_follow_up(
        "第一个",
        context("meaning_lookup"),
        "cet4",
    ) == {"kind": "not_follow_up"}
    assert resolve_follow_up("第一个", None, "cet4") == {"kind": "not_follow_up"}
    assert resolve_follow_up(
        "请看第一个",
        context("spelling_clarification"),
        "cet4",
    ) == {"kind": "not_follow_up"}


def test_out_of_range_bare_spelling_ordinal_stays_clarification():
    from backend.app.conversation.learning_context import resolve_follow_up
    from backend.app.schemas.chat import (
        ConversationalLearningContext,
        LearningCandidateRef,
    )

    context = ConversationalLearningContext(
        activeExamTarget="cet4",
        sourceMessageId="assistant_spelling_candidates",
        topicKind="spelling_clarification",
        sourceQuery="acess 是什么意思",
        candidates=[
            LearningCandidateRef(index=1, lemma="access", label="access"),
            LearningCandidateRef(index=2, lemma="assess", label="assess"),
        ],
        availableActions=["context_choice"],
    )

    result = resolve_follow_up("第三个", context, "cet4")

    assert result["kind"] == "clarification"
    assert [item["lemma"] for item in result["options"]] == ["access", "assess"]
