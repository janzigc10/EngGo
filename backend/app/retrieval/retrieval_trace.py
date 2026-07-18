from __future__ import annotations

import json
import math
from collections.abc import Mapping
from copy import deepcopy
from enum import Enum
from pathlib import Path
from threading import Lock
from time import perf_counter_ns
from typing import Protocol


TRACE_SCHEMA_VERSION = 1

_REDACTED = "[REDACTED]"
_SENSITIVE_KEY_FRAGMENTS = (
    "apikey",
    "authorization",
    "cookie",
    "password",
    "secret",
)
_SENSITIVE_KEYS = frozenset(
    {
        "accesstoken",
        "bearertoken",
        "conversationhistory",
        "history",
        "idtoken",
        "refreshtoken",
        "token",
    },
)
_LATENCY_STAGES = frozenset(
    {
        "route",
        "tool",
        "candidate",
        "decision",
        "recovery",
        "total",
    },
)
_SPELLING_METADATA_KEYS = (
    "candidateStatus",
    "lexiconVersion",
    "inputIsKnownWord",
    "globalCompetitionComplete",
    "sourceStatus",
)
_SPELLING_DECISION_KEYS = (
    "kind",
    "reasonCode",
    "selectedCandidates",
)
_CANDIDATE_KEYS = (
    "rank",
    "lemma",
    "editDistance",
    "score",
    "rankKey",
    "sourceKind",
    "inActiveExamScope",
    "scopeCodes",
    "reasonCodes",
)


def _normalized_key(value: object) -> str:
    return "".join(character for character in str(value).lower() if character.isalnum())


def _is_sensitive_key(value: object) -> bool:
    normalized = _normalized_key(value)
    return normalized in _SENSITIVE_KEYS or any(
        fragment in normalized for fragment in _SENSITIVE_KEY_FRAGMENTS
    )


def _json_safe(value: object) -> object:
    """Return a detached, JSON-compatible value with sensitive fields redacted."""

    if value is None or isinstance(value, (str, int, bool)):
        return value
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, Enum):
        return _json_safe(value.value)
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, Mapping):
        result: dict[str, object] = {}
        for raw_key, raw_value in value.items():
            key = str(raw_key)
            result[key] = _REDACTED if _is_sensitive_key(key) else _json_safe(raw_value)
        return result
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    if isinstance(value, (set, frozenset)):
        return sorted((_json_safe(item) for item in value), key=str)

    # Trace data is deliberately restricted to diagnostics, not arbitrary object
    # representations that may contain credentials or hidden provider state.
    return None


def _detached_snapshot(snapshot: Mapping[str, object]) -> dict[str, object]:
    safe = _json_safe(snapshot)
    if not isinstance(safe, dict):
        return {}
    return deepcopy(safe)


class RetrievalTraceSink(Protocol):
    def emit(self, snapshot: Mapping[str, object]) -> None: ...


class NullRetrievalTraceSink:
    """Default trace sink: deliberately performs no I/O."""

    def emit(self, snapshot: Mapping[str, object]) -> None:
        return None


class InMemoryRetrievalTraceSink:
    """Ordered trace storage for unit tests and benchmark consumers."""

    def __init__(self) -> None:
        self.snapshots: list[dict[str, object]] = []
        self._lock = Lock()

    def emit(self, snapshot: Mapping[str, object]) -> None:
        detached = _detached_snapshot(snapshot)
        with self._lock:
            self.snapshots.append(detached)
        return None


class JsonlRetrievalTraceSink:
    """Opt-in UTF-8 JSONL sink whose failures never affect chat responses."""

    def __init__(self, path: str | Path) -> None:
        if isinstance(path, str) and not path.strip():
            raise ValueError("trace JSONL path must not be empty")

        self.path = Path(path)
        self.failure_count = 0
        self.last_error: str | None = None
        self._lock = Lock()

    def emit(self, snapshot: Mapping[str, object]) -> None:
        try:
            serialized = json.dumps(
                _detached_snapshot(snapshot),
                ensure_ascii=False,
                allow_nan=False,
                separators=(",", ":"),
            )
            with self._lock:
                self.path.parent.mkdir(parents=True, exist_ok=True)
                with self.path.open("a", encoding="utf-8", newline="\n") as output:
                    output.write(serialized)
                    output.write("\n")
                self.last_error = None
        except Exception as error:  # fail-open is the sink's primary contract
            with self._lock:
                self.failure_count += 1
                self.last_error = f"{type(error).__name__}: {error}"
        return None


class RetrievalTraceRecorder:
    """Build and emit one stable retrieval snapshot for one chat request."""

    def __init__(
        self,
        *,
        request_id: str,
        active_exam_target: str,
        sink: RetrievalTraceSink,
        environment: Mapping[str, object] | None = None,
        include_raw_query: bool = False,
        raw_query: str | None = None,
    ) -> None:
        if not request_id.strip():
            raise ValueError("request_id must not be empty")
        if not active_exam_target.strip():
            raise ValueError("active_exam_target must not be empty")

        self._sink = sink
        self._started_ns = perf_counter_ns()
        self._lock = Lock()
        self._finalized_snapshot: dict[str, object] | None = None
        self._data: dict[str, object] = {
            "schemaVersion": TRACE_SCHEMA_VERSION,
            "requestId": request_id,
            "activeExamTarget": active_exam_target,
            "environment": _json_safe(environment or {}),
            "route": {
                "source": None,
                "confidence": None,
                "ambiguityReasons": [],
                "queryMode": None,
                "normalizedSlots": {},
            },
            "tools": {
                "attempted": [],
                "selected": None,
            },
            "candidates": [],
            "preRecovery": {
                "resolution": "not_observed",
                "noMatchReason": None,
                "spellingDecision": None,
            },
            "recovery": {
                "kind": "none",
                "providerOutcome": "not_attempted",
            },
            "latencyMs": {},
        }
        if include_raw_query and raw_query is not None:
            self._data["rawQuery"] = raw_query

    def _is_finalized(self) -> bool:
        return self._finalized_snapshot is not None

    def record_route(
        self,
        *,
        source: str,
        confidence: float | None,
        ambiguity_reasons: list[str] | tuple[str, ...],
        query_mode: str,
        normalized_slots: Mapping[str, object],
    ) -> None:
        with self._lock:
            if self._is_finalized():
                return
            self._data["route"] = {
                "source": source,
                "confidence": _json_safe(confidence),
                "ambiguityReasons": _json_safe(ambiguity_reasons),
                "queryMode": query_mode,
                "normalizedSlots": _json_safe(normalized_slots),
            }

    def record_tool_attempt(self, name: str) -> None:
        with self._lock:
            if self._is_finalized():
                return
            tools = self._data["tools"]
            if not isinstance(tools, dict):
                return
            attempted = tools.get("attempted")
            if isinstance(attempted, list) and name not in attempted:
                attempted.append(name)

    def record_tool_selected(self, name: str | None) -> None:
        with self._lock:
            if self._is_finalized():
                return
            tools = self._data["tools"]
            if isinstance(tools, dict):
                tools["selected"] = name

    def record_candidates(
        self,
        candidates: list[Mapping[str, object]] | tuple[Mapping[str, object], ...],
    ) -> None:
        normalized_candidates: list[dict[str, object]] = []
        for fallback_rank, candidate_value in enumerate(candidates, start=1):
            candidate = {
                key: _json_safe(candidate_value[key])
                for key in _CANDIDATE_KEYS
                if key in candidate_value
            }
            candidate.setdefault("rank", fallback_rank)
            normalized_candidates.append(candidate)

        with self._lock:
            if self._is_finalized():
                return
            self._data["candidates"] = normalized_candidates

    def record_spelling_diagnostics(
        self,
        diagnostics: Mapping[str, object] | None,
    ) -> None:
        if not diagnostics:
            return

        spelling_value = diagnostics.get("spelling", diagnostics)
        if not isinstance(spelling_value, Mapping):
            return

        spelling: dict[str, object] = {
            key: _json_safe(spelling_value[key])
            for key in _SPELLING_METADATA_KEYS
            if key in spelling_value
        }
        decision_value = spelling_value.get("decision")
        if isinstance(decision_value, Mapping):
            decision = {
                key: _json_safe(decision_value[key])
                for key in _SPELLING_DECISION_KEYS
                if key in decision_value
            }
            if decision:
                spelling["decision"] = decision

        candidate_values = spelling_value.get("candidates")
        candidates: list[dict[str, object]] = []
        if isinstance(candidate_values, (list, tuple)):
            for fallback_rank, candidate_value in enumerate(candidate_values, start=1):
                if not isinstance(candidate_value, Mapping):
                    continue
                candidate = {
                    key: _json_safe(candidate_value[key])
                    for key in _CANDIDATE_KEYS
                    if key in candidate_value
                }
                candidate.setdefault("rank", fallback_rank)
                candidates.append(candidate)

        latency_value = diagnostics.get("latencyMs")
        latency_updates: list[tuple[str, object]] = []
        if isinstance(latency_value, Mapping):
            if "candidateGeneration" in latency_value:
                latency_updates.append(("candidate", latency_value["candidateGeneration"]))
            if "decision" in latency_value:
                latency_updates.append(("decision", latency_value["decision"]))

        with self._lock:
            if self._is_finalized():
                return
            if spelling:
                self._data["spelling"] = spelling
            self._data["candidates"] = candidates
            if isinstance(decision_value, Mapping):
                decision_kind = decision_value.get("kind")
                pre_recovery = self._data.get("preRecovery")
                if isinstance(decision_kind, str) and isinstance(pre_recovery, dict):
                    pre_recovery["spellingDecision"] = decision_kind

            latency = self._data.get("latencyMs")
            if isinstance(latency, dict):
                for stage, value in latency_updates:
                    normalized = self._valid_latency(value)
                    if normalized is not None:
                        latency[stage] = normalized

    def record_pre_recovery(
        self,
        *,
        resolution: str,
        no_match_reason: str | None = None,
        spelling_decision: str | None = None,
    ) -> None:
        with self._lock:
            if self._is_finalized():
                return
            previous = self._data.get("preRecovery")
            inferred_spelling_decision = (
                previous.get("spellingDecision")
                if isinstance(previous, dict)
                else None
            )
            self._data["preRecovery"] = {
                "resolution": resolution,
                "noMatchReason": no_match_reason,
                "spellingDecision": (
                    spelling_decision
                    if spelling_decision is not None
                    else inferred_spelling_decision
                ),
            }

    def record_recovery(self, *, kind: str, provider_outcome: str) -> None:
        with self._lock:
            if self._is_finalized():
                return
            self._data["recovery"] = {
                "kind": kind,
                "providerOutcome": provider_outcome,
            }

    @staticmethod
    def _valid_latency(value: object) -> float | None:
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return None
        normalized = float(value)
        if not math.isfinite(normalized) or normalized < 0:
            return None
        return round(normalized, 3)

    def record_latency(self, stage: str, value_ms: float) -> None:
        if stage not in _LATENCY_STAGES:
            return
        normalized = self._valid_latency(value_ms)
        if normalized is None:
            return

        with self._lock:
            if self._is_finalized():
                return
            latency = self._data.get("latencyMs")
            if isinstance(latency, dict):
                latency[stage] = normalized

    def snapshot(self) -> dict[str, object]:
        with self._lock:
            source = self._finalized_snapshot or self._data
            return _detached_snapshot(source)

    def finalize(self, *, status_code: int, answer_kind: str) -> dict[str, object]:
        with self._lock:
            if self._finalized_snapshot is not None:
                return _detached_snapshot(self._finalized_snapshot)

            latency = self._data.get("latencyMs")
            if isinstance(latency, dict) and "total" not in latency:
                elapsed_ms = (perf_counter_ns() - self._started_ns) / 1_000_000
                latency["total"] = round(max(elapsed_ms, 0.0), 3)
            self._data["final"] = {
                "statusCode": status_code,
                "answerKind": answer_kind,
            }
            self._finalized_snapshot = _detached_snapshot(self._data)
            emitted = _detached_snapshot(self._finalized_snapshot)

        try:
            self._sink.emit(emitted)
        except Exception:
            # Third-party/custom sinks must obey the same fail-open boundary.
            pass
        return _detached_snapshot(self._finalized_snapshot)
