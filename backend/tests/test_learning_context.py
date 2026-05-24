from backend.app.conversation.learning_context import build_conversation_context
from backend.app.schemas.chat import ChatSuccessResponse


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
    assert context.availableActions == ["collect_one", "collect_group"]


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
