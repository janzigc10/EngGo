import json

import backend.app.main as app_main
from backend.app.core.config import Settings
from backend.app.retrieval.retrieval_trace import (
    InMemoryRetrievalTraceSink,
    JsonlRetrievalTraceSink,
    NullRetrievalTraceSink,
    RetrievalTraceRecorder,
)


def spelling_diagnostics() -> dict[str, object]:
    return {
        "spelling": {
            "candidateStatus": "ready",
            "lexiconVersion": "ecdict:test|wordbook:test",
            "inputIsKnownWord": False,
            "globalCompetitionComplete": True,
            "sourceStatus": "ready",
            "candidates": [
                {
                    "lemma": "request",
                    "editDistance": 1,
                    "inActiveExamScope": True,
                    "scopeCodes": ("cet4", "cet6"),
                    "sourceKind": "compact_wordbook",
                    "reasonCodes": ("edit_distance_1", "active_exam_scope"),
                    "rankKey": (1, 0, "request"),
                },
            ],
            "decision": {
                "kind": "auto_correct",
                "reasonCode": "high_confidence",
                "selectedCandidates": ("request",),
            },
        },
        "latencyMs": {
            "candidateGeneration": 4.1254,
            "decision": 0.1246,
        },
    }


def test_recorder_builds_one_stable_snapshot_and_emits_once():
    sink = InMemoryRetrievalTraceSink()
    normalized_slots = {"englishTerms": ["reqeust"]}
    diagnostics = spelling_diagnostics()
    recorder = RetrievalTraceRecorder(
        request_id="req_trace_recorder",
        active_exam_target="cet6",
        sink=sink,
        environment={
            "providerMode": "off",
            "dataVersion": "ecdict:test",
            "apiKey": "must-not-leak",
            "history": [{"role": "user", "content": "must-not-leak"}],
        },
        raw_query="reqeust 是什么意思",
    )

    recorder.record_route(
        source="rule",
        confidence=0.78,
        ambiguity_reasons=("fuzzy_or_spelling_path",),
        query_mode="fuzzy_recall",
        normalized_slots=normalized_slots,
    )
    recorder.record_tool_attempt("ordinary_lookup")
    recorder.record_tool_attempt("ordinary_lookup")
    recorder.record_tool_selected("ordinary_lookup")
    recorder.record_spelling_diagnostics(diagnostics)
    recorder.record_pre_recovery(
        resolution="resolved",
        no_match_reason=None,
    )
    recorder.record_recovery(kind="none", provider_outcome="not_attempted")
    recorder.record_latency("route", 1.2514)
    recorder.record_latency("tool", 5.4996)

    # Recorded values are detached from mutable service diagnostics.
    normalized_slots["englishTerms"].append("mutated")
    diagnostics["spelling"]["candidates"][0]["lemma"] = "mutated"

    first = recorder.finalize(status_code=200, answer_kind="grounded")
    second = recorder.finalize(status_code=500, answer_kind="plain")
    recorder.record_tool_attempt("advanced_lookup")

    assert first == second == sink.snapshots[0]
    assert len(sink.snapshots) == 1
    assert first["schemaVersion"] == 1
    assert first["requestId"] == "req_trace_recorder"
    assert first["activeExamTarget"] == "cet6"
    assert "rawQuery" not in first
    assert first["environment"] == {
        "providerMode": "off",
        "dataVersion": "ecdict:test",
        "apiKey": "[REDACTED]",
        "history": "[REDACTED]",
    }
    assert first["route"] == {
        "source": "rule",
        "confidence": 0.78,
        "ambiguityReasons": ["fuzzy_or_spelling_path"],
        "queryMode": "fuzzy_recall",
        "normalizedSlots": {"englishTerms": ["reqeust"]},
    }
    assert first["tools"] == {
        "attempted": ["ordinary_lookup"],
        "selected": "ordinary_lookup",
    }
    assert first["candidates"][0] == {
        "rank": 1,
        "lemma": "request",
        "editDistance": 1,
        "rankKey": [1, 0, "request"],
        "sourceKind": "compact_wordbook",
        "inActiveExamScope": True,
        "scopeCodes": ["cet4", "cet6"],
        "reasonCodes": ["edit_distance_1", "active_exam_scope"],
    }
    assert first["preRecovery"] == {
        "resolution": "resolved",
        "noMatchReason": None,
        "spellingDecision": "auto_correct",
    }
    assert first["recovery"] == {
        "kind": "none",
        "providerOutcome": "not_attempted",
    }
    assert first["final"] == {"statusCode": 200, "answerKind": "grounded"}
    assert first["latencyMs"]["route"] == 1.251
    assert first["latencyMs"]["tool"] == 5.5
    assert first["latencyMs"]["candidate"] == 4.125
    assert first["latencyMs"]["decision"] == 0.125
    assert first["latencyMs"]["total"] >= 0


def test_raw_query_requires_explicit_opt_in():
    disabled = RetrievalTraceRecorder(
        request_id="req_trace_private",
        active_exam_target="cet4",
        sink=NullRetrievalTraceSink(),
        raw_query="sensitive learner query",
    )
    enabled = RetrievalTraceRecorder(
        request_id="req_trace_development",
        active_exam_target="cet4",
        sink=NullRetrievalTraceSink(),
        include_raw_query=True,
        raw_query="纠错 request",
    )

    assert "rawQuery" not in disabled.snapshot()
    assert enabled.snapshot()["rawQuery"] == "纠错 request"


def test_jsonl_sink_is_lazy_utf8_append_only_and_fail_open(tmp_path):
    output_path = tmp_path / "nested" / "检索-trace.jsonl"
    sink = JsonlRetrievalTraceSink(output_path)

    assert not output_path.exists()
    assert not output_path.parent.exists()

    assert sink.emit({"requestId": "req_1", "rawQuery": "纠错 request"}) is None
    assert sink.emit({"requestId": "req_2", "rawQuery": "候选"}) is None

    raw_bytes = output_path.read_bytes()
    assert not raw_bytes.startswith(b"\xef\xbb\xbf")
    raw_text = raw_bytes.decode("utf-8")
    assert "纠错 request" in raw_text
    assert "\\u7ea0\\u9519" not in raw_text
    assert [json.loads(line)["requestId"] for line in raw_text.splitlines()] == [
        "req_1",
        "req_2",
    ]
    assert sink.failure_count == 0
    assert sink.last_error is None

    failing_path = tmp_path / "is-a-directory"
    failing_path.mkdir()
    failing_sink = JsonlRetrievalTraceSink(failing_path)

    assert failing_sink.emit({"requestId": "req_failure"}) is None
    assert failing_sink.failure_count == 1
    assert failing_sink.last_error is not None


def test_recorder_is_fail_open_for_a_custom_broken_sink():
    class BrokenSink:
        def emit(self, _snapshot):
            raise RuntimeError("diagnostic storage failed")

    recorder = RetrievalTraceRecorder(
        request_id="req_trace_broken_sink",
        active_exam_target="postgrad",
        sink=BrokenSink(),
    )

    snapshot = recorder.finalize(status_code=200, answer_kind="plain")

    assert snapshot["final"] == {"statusCode": 200, "answerKind": "plain"}


def test_create_app_defaults_to_null_and_honors_explicit_trace_sink(
    tmp_path,
    monkeypatch,
):
    configured_path = tmp_path / "configured-trace.jsonl"
    monkeypatch.setattr(
        app_main,
        "load_settings",
        lambda: Settings(
            source_lemma_base_dir=tmp_path,
            ecdict_dictionary_path=tmp_path / "ecdict.csv",
            retrieval_trace_jsonl_path=configured_path,
            retrieval_trace_include_raw_query=True,
            build_version="build-fixture",
            data_version="data-fixture",
        ),
    )

    configured_app = app_main.create_app()
    assert isinstance(
        configured_app.state.retrieval_trace_sink,
        JsonlRetrievalTraceSink,
    )
    assert configured_app.state.retrieval_trace_sink.path == configured_path
    assert configured_app.state.retrieval_trace_include_raw_query is True
    assert configured_app.state.retrieval_trace_environment == {
        "name": "development",
        "structuredRuntime": False,
        "providerMode": "off",
        "buildVersion": "build-fixture",
        "dataVersion": "data-fixture",
    }
    assert not configured_path.exists()

    injected_sink = InMemoryRetrievalTraceSink()
    injected_app = app_main.create_app(retrieval_trace_sink=injected_sink)
    assert injected_app.state.retrieval_trace_sink is injected_sink
    assert not configured_path.exists()

    monkeypatch.setattr(
        app_main,
        "load_settings",
        lambda: Settings(
            source_lemma_base_dir=tmp_path,
            ecdict_dictionary_path=tmp_path / "ecdict.csv",
        ),
    )
    default_app = app_main.create_app()
    assert isinstance(default_app.state.retrieval_trace_sink, NullRetrievalTraceSink)
