from backend.app.conversation.learning_context import (
    build_conversation_context,
    resolve_follow_up,
)
from backend.app.schemas.chat import (
    ChatSuccessResponse,
    ConversationalLearningContext,
    LearningCandidateRef,
    LearningFocus,
)


def _context(
    lemmas: list[str],
    *,
    active_exam_target: str = "cet6",
    topic_kind: str = "direct_compare",
    focus_index: int | None = None,
    expires_after_turns: int = 2,
    source_query: str | None = "access assess excess 怎么区分",
    continuation_lemmas: list[str] | None = None,
) -> ConversationalLearningContext:
    candidates = [
        LearningCandidateRef(index=index, lemma=lemma, label=lemma)
        for index, lemma in enumerate(lemmas, start=1)
    ]
    continuation_candidates = [
        LearningCandidateRef(index=index, lemma=lemma, label=lemma)
        for index, lemma in enumerate(continuation_lemmas or [], start=1)
    ]
    focus = None
    if focus_index is not None:
        candidate = candidates[focus_index - 1]
        focus = LearningFocus(
            kind="lemma",
            label=candidate.label,
            lemma=candidate.lemma,
            index=candidate.index,
        )

    return ConversationalLearningContext(
        activeExamTarget=active_exam_target,
        sourceMessageId="assistant_test",
        topicKind=topic_kind,
        sourceQuery=source_query,
        focus=focus,
        candidates=candidates,
        continuationCandidates=continuation_candidates,
        availableActions=["collect_one", "collect_group"],
        expiresAfterTurns=expires_after_turns,
    )


def _target_refs(result: dict) -> list[dict]:
    return result["targetRefs"]


def test_resolver_rewrites_ordinal_meaning_follow_up():
    result = resolve_follow_up(
        "第二个是什么意思",
        _context(["access", "assess", "excess"]),
        "cet6",
    )

    assert result["kind"] == "resolved_query"
    assert result["query"] == "assess 是什么意思"
    assert result["activeExamTarget"] == "cet6"
    assert [item["lemma"] for item in _target_refs(result)] == ["assess"]
    assert result["reason"] == "ordinal_target"


def test_resolver_rewrites_ordinal_what_is_follow_up_as_meaning():
    result = resolve_follow_up(
        "第二个是什么",
        _context(["access", "assess", "excess"]),
        "cet6",
    )

    assert result["kind"] == "resolved_query"
    assert result["query"] == "assess 是什么意思"
    assert [item["lemma"] for item in _target_refs(result)] == ["assess"]
    assert result["reason"] == "ordinal_target"


def test_resolver_clarifies_relative_ordinal_reference():
    result = resolve_follow_up(
        "倒数第二个是什么意思",
        _context(["access", "assess", "excess"]),
        "cet6",
    )

    assert result["kind"] == "clarification"
    assert [item["lemma"] for item in result["options"]] == [
        "access",
        "assess",
        "excess",
    ]


def test_resolver_rewrites_fourth_ordinal_meaning_follow_up():
    result = resolve_follow_up(
        "第四个是什么意思",
        _context(["access", "assess", "excess", "axis"]),
        "cet6",
    )

    assert result["kind"] == "resolved_query"
    assert result["query"] == "axis 是什么意思"
    assert [item["lemma"] for item in _target_refs(result)] == ["axis"]


def test_resolver_rewrites_fourth_digit_ordinal_meaning_follow_up():
    result = resolve_follow_up(
        "第4个是什么意思",
        _context(["access", "assess", "excess", "axis"]),
        "cet6",
    )

    assert result["kind"] == "resolved_query"
    assert result["query"] == "axis 是什么意思"
    assert [item["lemma"] for item in _target_refs(result)] == ["axis"]


def test_resolver_clarifies_unsupported_ordinal_reference():
    result = resolve_follow_up(
        "第六个是什么意思",
        _context(["access", "assess", "excess", "axis", "asset"]),
        "cet6",
    )

    assert result["kind"] == "clarification"
    assert [item["lemma"] for item in result["options"]] == [
        "access",
        "assess",
        "excess",
        "axis",
        "asset",
    ]


def test_resolver_clarifies_unsupported_digit_ordinal_reference():
    result = resolve_follow_up(
        "第7个是什么意思",
        _context(["access", "assess", "excess", "axis", "asset"]),
        "cet6",
    )

    assert result["kind"] == "clarification"
    assert [item["lemma"] for item in result["options"]] == [
        "access",
        "assess",
        "excess",
        "axis",
        "asset",
    ]


def test_resolver_clarifies_multi_digit_unsupported_ordinal_reference():
    result = resolve_follow_up(
        "第11个是什么意思",
        _context(["access", "assess", "excess", "axis", "asset"]),
        "cet6",
    )

    assert result["kind"] == "clarification"
    assert [item["lemma"] for item in result["options"]] == [
        "access",
        "assess",
        "excess",
        "axis",
        "asset",
    ]


def test_resolver_clarifies_chinese_number_unsupported_ordinal_reference():
    result = resolve_follow_up(
        "第十一个是什么意思",
        _context(["access", "assess", "excess", "axis", "asset"]),
        "cet6",
    )

    assert result["kind"] == "clarification"
    assert [item["lemma"] for item in result["options"]] == [
        "access",
        "assess",
        "excess",
        "axis",
        "asset",
    ]


def test_resolver_clarifies_traditional_marker_unsupported_ordinal_reference():
    result = resolve_follow_up(
        "第十一個是什么意思",
        _context(["access", "assess", "excess", "axis", "asset"]),
        "cet6",
    )

    assert result["kind"] == "clarification"
    assert [item["lemma"] for item in result["options"]] == [
        "access",
        "assess",
        "excess",
        "axis",
        "asset",
    ]


def test_resolver_rewrites_ordinal_usage_follow_up_for_shape_neighbors():
    result = resolve_follow_up(
        "第二个怎么用",
        _context(["evaluate", "evacuate", "escalate"], topic_kind="shape_neighbors"),
        "cet6",
    )

    assert result["kind"] == "resolved_query"
    assert result["query"] == "evacuate 怎么用"
    assert [item["lemma"] for item in _target_refs(result)] == ["evacuate"]


def test_resolver_maps_group_memory_follow_up_to_study_guidance_action():
    result = resolve_follow_up(
        "这组怎么背",
        _context(["access", "assess", "excess"]),
        "cet6",
    )

    assert result["kind"] == "resolved_action"
    assert result["action"] == "study_guidance"
    assert [item["lemma"] for item in _target_refs(result)] == [
        "access",
        "assess",
        "excess",
    ]


def test_resolver_maps_ordinal_memory_follow_up_to_study_guidance_action():
    result = resolve_follow_up(
        "第二个怎么记",
        _context(["access", "assess", "excess"]),
        "cet6",
    )

    assert result["kind"] == "resolved_action"
    assert result["action"] == "study_guidance"
    assert [item["lemma"] for item in _target_refs(result)] == ["assess"]


def test_resolver_reuses_source_query_for_scope_switch_with_context():
    result = resolve_follow_up(
        "换成考研范围",
        _context(
            ["access", "assess", "excess"],
            source_query="access assess excess 怎么区分",
        ),
        "cet6",
    )

    assert result["kind"] == "resolved_query"
    assert result["query"] == "access assess excess 怎么区分"
    assert result["activeExamTarget"] == "postgrad"
    assert result["reason"] == "scope_switch"
    assert [item["lemma"] for item in _target_refs(result)] == [
        "access",
        "assess",
        "excess",
    ]


def test_resolver_maps_scope_switch_without_context_to_action():
    result = resolve_follow_up("只看四级", None, "cet6")

    assert result["kind"] == "resolved_action"
    assert result["action"] == "switch_scope"
    assert result["activeExamTarget"] == "cet4"
    assert result["targetRefs"] == []


def test_resolver_does_not_scope_switch_from_context_when_query_has_seed():
    result = resolve_follow_up(
        "access 换成考研范围",
        _context(
            ["evaluate", "evacuate"],
            source_query="evaluate evacuate 怎么区分",
        ),
        "cet6",
    )

    assert result["kind"] == "not_follow_up"


def test_resolver_scope_switch_allows_english_scope_token():
    result = resolve_follow_up(
        "切到 CET-4 范围",
        _context(
            ["access", "assess", "excess"],
            source_query="access assess excess 怎么区分",
        ),
        "cet6",
    )

    assert result["kind"] == "resolved_query"
    assert result["activeExamTarget"] == "cet4"


def test_resolver_maps_show_more_to_continuation_candidates():
    result = resolve_follow_up(
        "还有吗",
        _context(
            ["evaluate", "evacuate"],
            topic_kind="shape_neighbors",
            continuation_lemmas=["escalate", "graduate", "valuable"],
        ),
        "cet6",
    )

    assert result["kind"] == "resolved_action"
    assert result["action"] == "show_more"
    assert [item["lemma"] for item in _target_refs(result)] == [
        "escalate",
        "graduate",
        "valuable",
    ]


def test_resolver_maps_show_more_without_continuation_to_empty_action():
    result = resolve_follow_up(
        "还有吗",
        _context(["evaluate", "evacuate"], topic_kind="shape_neighbors"),
        "cet6",
    )

    assert result["kind"] == "resolved_action"
    assert result["action"] == "show_more"
    assert result["targetRefs"] == []


def test_resolver_maps_context_choice_to_locked_candidate_set():
    result = resolve_follow_up(
        "哪个更正式",
        _context(["follow", "obey", "comply"], topic_kind="meaning_lookup"),
        "cet6",
    )

    assert result["kind"] == "resolved_action"
    assert result["action"] == "context_choice"
    assert [item["lemma"] for item in _target_refs(result)] == [
        "follow",
        "obey",
        "comply",
    ]


def test_resolver_maps_exam_context_choice_to_locked_candidate_set():
    result = resolve_follow_up(
        "哪个更适合考试表达",
        _context(["access", "assess", "excess"]),
        "cet6",
    )

    assert result["kind"] == "resolved_action"
    assert result["action"] == "context_choice"
    assert [item["lemma"] for item in _target_refs(result)] == [
        "access",
        "assess",
        "excess",
    ]


def test_resolver_clarifies_context_choice_without_context():
    result = resolve_follow_up("哪个更正式", None, "cet6")

    assert result["kind"] == "clarification"
    assert result["options"] == []


def test_resolver_does_not_capture_explicit_seed_style_request_as_follow_up():
    result = resolve_follow_up(
        "用作文更正式地表达 good",
        _context(["follow", "obey", "comply"], topic_kind="meaning_lookup"),
        "cet6",
    )

    assert result == {"kind": "not_follow_up"}


def test_resolver_clarifies_context_choice_with_single_candidate():
    result = resolve_follow_up("哪个更常用", _context(["follow"]), "cet6")

    assert result["kind"] == "clarification"
    assert [item["lemma"] for item in result["options"]] == ["follow"]


def test_resolver_ignores_group_marker_when_query_has_explicit_seed_without_context():
    result = resolve_follow_up("sign这组词怎么背", None, "cet6")

    assert result["kind"] == "not_follow_up"


def test_resolver_rewrites_group_compare_follow_up():
    result = resolve_follow_up(
        "这组怎么区分",
        _context(["access", "assess", "excess"]),
        "cet6",
    )

    assert result["kind"] == "resolved_query"
    assert result["query"] == "access assess excess 怎么区分"
    assert [item["lemma"] for item in _target_refs(result)] == [
        "access",
        "assess",
        "excess",
    ]


def test_resolver_maps_ordinal_collect_to_single_candidate_action():
    result = resolve_follow_up(
        "收藏第二个",
        _context(["access", "assess", "excess"]),
        "cet6",
    )

    assert result["kind"] == "resolved_action"
    assert result["action"] == "collect_one"
    assert result["activeExamTarget"] == "cet6"
    assert [item["lemma"] for item in _target_refs(result)] == ["assess"]


def test_resolver_clarifies_collect_with_multiple_ordinals():
    result = resolve_follow_up(
        "收藏第二个和第三个",
        _context(["access", "assess", "excess"]),
        "cet6",
    )

    assert result["kind"] == "clarification"
    assert "action" not in result
    assert [item["lemma"] for item in result["options"]] == [
        "access",
        "assess",
        "excess",
    ]


def test_resolver_clarifies_mixed_last_and_ordinal_references():
    result = resolve_follow_up(
        "最后一个和第一个怎么区分",
        _context(["access", "assess", "excess"]),
        "cet6",
    )

    assert result["kind"] == "clarification"
    assert [item["lemma"] for item in result["options"]] == [
        "access",
        "assess",
        "excess",
    ]


def test_resolver_clarifies_mixed_last_and_ordinal_usage_reference():
    result = resolve_follow_up(
        "最后一个和第一个怎么用",
        _context(["access", "assess", "excess"]),
        "cet6",
    )

    assert result["kind"] == "clarification"
    assert [item["lemma"] for item in result["options"]] == [
        "access",
        "assess",
        "excess",
    ]


def test_resolver_clarifies_mixed_ordinal_and_near_reference():
    result = resolve_follow_up(
        "第二个和这个是什么意思",
        _context(["access", "assess", "excess"]),
        "cet6",
    )

    assert result["kind"] == "clarification"
    assert [item["lemma"] for item in result["options"]] == [
        "access",
        "assess",
        "excess",
    ]


def test_resolver_clarifies_mixed_explicit_candidate_and_ordinal_reference():
    result = resolve_follow_up(
        "access 和第二个怎么区分",
        _context(["access", "assess", "excess"]),
        "cet6",
    )

    assert result["kind"] == "clarification"
    assert [item["lemma"] for item in result["options"]] == [
        "access",
        "assess",
        "excess",
    ]


def test_resolver_clarifies_mixed_explicit_candidate_and_unsupported_ordinal():
    result = resolve_follow_up(
        "access 和第十一个怎么区分",
        _context(["access", "assess", "excess"]),
        "cet6",
    )

    assert result["kind"] == "clarification"
    assert [item["lemma"] for item in result["options"]] == [
        "access",
        "assess",
        "excess",
    ]


def test_resolver_maps_group_collect_to_group_action():
    result = resolve_follow_up(
        "把这组都收藏",
        _context(["access", "assess", "excess"]),
        "cet6",
    )

    assert result["kind"] == "resolved_action"
    assert result["action"] == "collect_group"
    assert [item["lemma"] for item in _target_refs(result)] == [
        "access",
        "assess",
        "excess",
    ]


def test_resolver_clarifies_when_context_exam_target_mismatches_request():
    result = resolve_follow_up(
        "把这组都收藏",
        _context(["access", "assess", "excess"], active_exam_target="cet6"),
        "postgrad",
    )

    assert result["kind"] == "clarification"
    assert result["options"] == []


def test_resolver_clarifies_follow_up_without_context():
    result = resolve_follow_up("第二个是什么意思", None, "cet6")

    assert result["kind"] == "clarification"
    assert "哪一个词" in result["message"]
    assert result["options"] == []


def test_resolver_clarifies_follow_up_with_stale_context():
    result = resolve_follow_up(
        "第二个是什么意思",
        _context(["access", "assess"], expires_after_turns=0),
        "cet6",
    )

    assert result["kind"] == "clarification"
    assert "query" not in result
    assert [item["lemma"] for item in result["options"]] == ["access", "assess"]


def test_resolver_clarifies_follow_up_with_empty_context():
    result = resolve_follow_up("第二个是什么意思", _context([]), "cet6")

    assert result["kind"] == "clarification"
    assert "query" not in result
    assert result["options"] == []


def test_resolver_clarifies_near_reference_with_multiple_candidates_and_no_focus():
    result = resolve_follow_up(
        "这个是什么意思",
        _context(["access", "assess", "excess"]),
        "cet6",
    )

    assert result["kind"] == "clarification"
    assert [item["lemma"] for item in result["options"]] == [
        "access",
        "assess",
        "excess",
    ]


def test_resolver_ignores_explicit_normal_lookup_with_context():
    result = resolve_follow_up(
        "access 是什么意思",
        _context(["access", "assess", "excess"]),
        "cet6",
    )

    assert result == {"kind": "not_follow_up"}


def test_context_capture_from_direct_compare_uses_comparison_member_order():
    payload = ChatSuccessResponse(
        answer="access / assess / excess",
        answerKind="grounded",
        grounding={
            "activeExamTarget": "cet6",
            "queryMode": "direct_compare",
            "answerStyle": "confusion_untangle",
            "resolution": "resolved",
            "mainAnswer": [],
            "confusionBoundary": [],
            "comparisonView": {
                "id": "access-assess-excess",
                "members": [
                    {
                        "entryId": "access",
                        "lemma": "access",
                        "partOfSpeech": "n. / v.",
                        "meaningsZh": ["进入权", "使用权"],
                        "sourceKind": "structured",
                        "reviewStatus": "verified",
                    },
                    {
                        "entryId": "assess",
                        "lemma": "assess",
                        "partOfSpeech": "v.",
                        "meaningsZh": ["评估"],
                        "sourceKind": "structured",
                    },
                    {
                        "entryId": "excess",
                        "lemma": "excess",
                        "partOfSpeech": "n. / adj.",
                        "meaningsZh": ["过量"],
                        "sourceKind": "structured",
                    },
                ],
            },
        },
        requestId="req_1",
    )

    context = build_conversation_context(
        payload=payload,
        active_exam_target="cet6",
        source_message_id="assistant_1",
    )

    assert context is not None
    assert context.topicKind == "direct_compare"
    assert [item.lemma for item in context.candidates] == [
        "access",
        "assess",
        "excess",
    ]
    assert [item.index for item in context.candidates] == [1, 2, 3]
    assert context.sourceQuery is None
    assert context.availableActions == [
        "collect_one",
        "switch_scope",
        "study_guidance",
        "collect_group",
        "context_choice",
    ]


def test_context_capture_falls_back_to_main_answer_when_view_members_are_malformed():
    payload = ChatSuccessResponse(
        answer="access / assess",
        answerKind="grounded",
        grounding={
            "activeExamTarget": "cet6",
            "queryMode": "direct_compare",
            "answerStyle": "confusion_untangle",
            "resolution": "resolved",
            "comparisonView": {
                "id": "malformed-view",
                "members": [
                    {"entryId": "missing-lemma", "lemma": "   "},
                    {"entryId": "also-missing"},
                    "not a candidate",
                ],
            },
            "mainAnswer": [
                {"entryId": "access", "lemma": "access", "meaningZh": "进入权"},
                {"entryId": "assess", "lemma": "assess", "meaningZh": "评估"},
            ],
            "confusionBoundary": [],
        },
        requestId="req_malformed",
    )

    context = build_conversation_context(
        payload=payload,
        active_exam_target="cet6",
        source_message_id="assistant_malformed",
    )

    assert context is not None
    assert context.topicKind == "direct_compare"
    assert [item.lemma for item in context.candidates] == ["access", "assess"]
    assert [item.index for item in context.candidates] == [1, 2]


def test_context_capture_from_ordinary_lookup_sets_single_lemma_focus():
    payload = ChatSuccessResponse(
        answer="access\n\nn./v. 进入权；使用权",
        answerKind="grounded",
        grounding={
            "activeExamTarget": "cet6",
            "queryMode": "direct_lookup",
            "answerStyle": "standard_lookup",
            "resolution": "resolved",
            "mainAnswer": [
                {
                    "entryId": "access",
                    "lemma": "access",
                    "partOfSpeech": "n. / v.",
                    "meaningZh": "进入权；使用权",
                    "sourceKind": "structured",
                },
            ],
            "confusionBoundary": [],
        },
        requestId="req_2",
    )

    context = build_conversation_context(
        payload=payload,
        active_exam_target="cet6",
        source_message_id="assistant_2",
    )

    assert context is not None
    assert context.topicKind == "standard_lookup"
    assert context.focus is not None
    assert context.focus.kind == "lemma"
    assert context.focus.lemma == "access"
    assert context.focus.index == 1
    assert [item.lemma for item in context.candidates] == ["access"]


def test_context_capture_from_word_family_preserves_main_answer_order():
    payload = ChatSuccessResponse(
        answer="respond family",
        answerKind="grounded",
        grounding={
            "activeExamTarget": "postgrad",
            "queryMode": "root_family_summary",
            "answerStyle": "root_family_summary",
            "resolution": "resolved",
            "learningIntentPlan": {"task": "word_family"},
            "mainAnswer": [
                {"entryId": "respond", "lemma": "respond", "meaningZh": "回答"},
                {"entryId": "response", "lemma": "response", "meaningZh": "回应"},
                {
                    "entryId": "responsible",
                    "lemma": "responsible",
                    "meaningZh": "负责的",
                },
            ],
            "confusionBoundary": [],
        },
        requestId="req_3",
    )

    context = build_conversation_context(
        payload=payload,
        active_exam_target="postgrad",
        source_message_id="assistant_3",
    )

    assert context is not None
    assert context.topicKind == "word_family"
    assert [item.lemma for item in context.candidates] == [
        "respond",
        "response",
        "responsible",
    ]
    assert [item.index for item in context.candidates] == [1, 2, 3]


def test_context_capture_records_source_query_and_continuation_candidates():
    payload = ChatSuccessResponse(
        answer="evaluate / evacuate",
        answerKind="grounded",
        grounding={
            "activeExamTarget": "postgrad",
            "query": "给我几个跟 evaluate 易混的单词",
            "queryMode": "shape_neighbor_search",
            "answerStyle": "broad_vocab_summary",
            "resolution": "resolved",
            "mainAnswer": [
                {"entryId": "evaluate", "lemma": "evaluate", "meaningZh": "评估"},
                {"entryId": "evacuate", "lemma": "evacuate", "meaningZh": "撤离"},
            ],
            "confusionBoundary": [],
            "lightCandidates": [
                {"entryId": "evaluate", "lemma": "evaluate", "meaningZh": "评估"},
                {"entryId": "evacuate", "lemma": "evacuate", "meaningZh": "撤离"},
                {"entryId": "escalate", "lemma": "escalate", "meaningZh": "升级"},
                {"entryId": "graduate", "lemma": "graduate", "meaningZh": "毕业"},
            ],
        },
        requestId="req_more",
    )

    context = build_conversation_context(
        payload=payload,
        active_exam_target="postgrad",
        source_message_id="assistant_more",
    )

    assert context is not None
    assert context.sourceQuery == "给我几个跟 evaluate 易混的单词"
    assert [item.lemma for item in context.candidates] == ["evaluate", "evacuate"]
    assert [item.lemma for item in context.continuationCandidates] == [
        "escalate",
        "graduate",
    ]
    assert "show_more" in context.availableActions


def test_context_capture_returns_none_for_no_match_or_plain_response():
    no_match_payload = ChatSuccessResponse(
        answer="没有稳定收录",
        answerKind="grounded",
        grounding={
            "activeExamTarget": "cet6",
            "queryMode": "root_family_summary",
            "answerStyle": "root_family_summary",
            "resolution": "no_match",
            "mainAnswer": [],
            "confusionBoundary": [],
        },
        requestId="req_4",
    )
    plain_payload = ChatSuccessResponse(
        answer="你好",
        answerKind="plain",
        requestId="req_5",
    )

    assert (
        build_conversation_context(
            payload=no_match_payload,
            active_exam_target="cet6",
            source_message_id="assistant_4",
        )
        is None
    )
    assert (
        build_conversation_context(
            payload=plain_payload,
            active_exam_target="cet6",
            source_message_id="assistant_5",
        )
        is None
    )
