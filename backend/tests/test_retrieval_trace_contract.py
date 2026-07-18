import builtins
import importlib
import json
from pathlib import Path

TRACE_MODULE = "backend.app.retrieval.retrieval_trace"


def representative_trace_snapshot(request_id: str) -> dict[str, object]:
    return {
        "schemaVersion": 1,
        "requestId": request_id,
        "rawQuery": "reqeust 是什么意思",
        "activeExamTarget": "cet6",
        "route": {
            "source": "rule",
            "confidence": 0.78,
            "ambiguityReasons": ["fuzzy_or_spelling_path"],
            "queryMode": "fuzzy_recall",
            "normalizedSlots": {"englishTerms": ["reqeust"]},
        },
        "tools": {
            "attempted": ["ordinary_lookup"],
            "selected": "ordinary_lookup",
        },
        "candidates": [
            {
                "rank": 1,
                "lemma": "request",
                "editDistance": 1,
                "sourceKind": "external_dictionary_basic",
                "inActiveExamScope": True,
                "reasonCodes": ["adjacent_transposition"],
            },
        ],
        "preRecovery": {
            "resolution": "resolved",
            "noMatchReason": None,
            "spellingDecision": "auto_correct",
        },
        "recovery": {
            "kind": "none",
            "providerOutcome": "not_attempted",
        },
        "final": {
            "statusCode": 200,
            "answerKind": "grounded",
        },
        "latencyMs": {
            "route": 1.25,
            "tool": 4.5,
            "total": 6.0,
        },
    }


def load_trace_module():
    # Resolve by the public module path fixed by the original Task 1 contract.
    return importlib.import_module(TRACE_MODULE)


def test_null_trace_sink_accepts_snapshot_without_file_io(monkeypatch):
    trace_module = load_trace_module()
    sink = trace_module.NullRetrievalTraceSink()
    snapshot = representative_trace_snapshot("req_trace_null")

    def fail_file_io(*_args, **_kwargs):
        raise AssertionError("null trace sink must not perform file I/O")

    monkeypatch.setattr(builtins, "open", fail_file_io)
    monkeypatch.setattr(Path, "open", fail_file_io)

    assert sink.emit(snapshot) is None


def test_in_memory_trace_sink_exposes_ordered_snapshots_directly():
    trace_module = load_trace_module()
    sink = trace_module.InMemoryRetrievalTraceSink()
    first = representative_trace_snapshot("req_trace_memory_1")
    second = representative_trace_snapshot("req_trace_memory_2")

    assert sink.emit(first) is None
    assert sink.emit(second) is None
    assert sink.snapshots == [first, second]


def test_jsonl_trace_sink_requires_explicit_path_and_is_fail_open(tmp_path):
    trace_module = load_trace_module()
    output_path = tmp_path / "retrieval-trace.jsonl"
    sink = trace_module.JsonlRetrievalTraceSink(output_path)
    first = representative_trace_snapshot("req_trace_jsonl_1")
    second = representative_trace_snapshot("req_trace_jsonl_2")

    assert not output_path.exists()
    assert sink.emit(first) is None
    assert sink.emit(second) is None

    serialized = [
        json.loads(line)
        for line in output_path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    assert serialized == [first, second]

    failing_sink = trace_module.JsonlRetrievalTraceSink(tmp_path)
    assert failing_sink.emit(representative_trace_snapshot("req_trace_jsonl_failure")) is None
