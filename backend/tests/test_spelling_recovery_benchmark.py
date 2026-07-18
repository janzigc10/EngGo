import json
from collections import defaultdict
from pathlib import Path

import pytest
import scripts.run_spelling_recovery_benchmark as benchmark_module

from scripts.run_spelling_recovery_benchmark import (
    DEFAULT_DATASET_ROOT,
    DEFAULT_CURRENT_OUTPUT_ROOT,
    DEFAULT_MANIFEST_PATH,
    DEFAULT_QUALITY_FIXTURES_PATH,
    DEFAULT_WORDBOOK_PATH,
    CURRENT_CANDIDATE_LIMIT,
    EXPECTED_CALIBRATION_COUNT,
    EXPECTED_COLLISION_GROUP_COUNT,
    EXPECTED_HELD_OUT_COUNT,
    EXPECTED_PAIR_COUNT,
    EXPECTED_PAIR_SET_SHA256,
    EXPECTED_UNIQUE_TYPO_COUNT,
    EXPECTED_WORDBOOK_SHA256,
    SCHEMA_VERSION,
    benchmark_source_versions,
    build_manifest_document,
    build_parser,
    complete_heldout_one_shot,
    current_artifact_paths,
    first_acceptable_rank,
    load_quality_fixtures,
    main,
    prepare_heldout_one_shot,
    process_rss_bytes,
    replay_policy_artifact_paths,
    run_policy_replay,
    sha256_file,
    summarize_current_records,
    summarize_baseline_records,
    validate_current_run_selection,
    validate_policy_replay_artifacts,
    validate_replay_output_dir,
    verify_manifest_document,
)


def load_checked_in_manifest():
    return json.loads(DEFAULT_MANIFEST_PATH.read_text(encoding="utf-8"))


def test_checked_in_manifest_has_pinned_pairs_grouped_split_and_strata():
    manifest = load_checked_in_manifest()

    verify_manifest_document(manifest)

    assert manifest["schemaVersion"] == SCHEMA_VERSION
    assert manifest["pairSet"] == {
        "count": EXPECTED_PAIR_COUNT,
        "uniqueTypoCount": EXPECTED_UNIQUE_TYPO_COUNT,
        "collisionGroupCount": EXPECTED_COLLISION_GROUP_COUNT,
        "collisionPairCount": 38,
        "serialization": "sorted lowercase typo<TAB>gold<LF>, UTF-8",
        "sha256": EXPECTED_PAIR_SET_SHA256,
    }
    assert manifest["split"]["calibrationCount"] == EXPECTED_CALIBRATION_COUNT
    assert manifest["split"]["heldOutCount"] == EXPECTED_HELD_OUT_COUNT
    assert manifest["wordPool"]["sha256"] == EXPECTED_WORDBOOK_SHA256

    splits_by_typo = defaultdict(set)
    ids = set()
    for case in manifest["cases"]:
        splits_by_typo[case["typo"]].add(case["split"])
        ids.add(case["id"])
        assert case["stratum"]["key"]
        assert case["stratum"]["primaryScope"] == case["activeExamTarget"]

    assert len(ids) == EXPECTED_PAIR_COUNT
    assert all(len(splits) == 1 for splits in splits_by_typo.values())


@pytest.mark.skipif(
    not (DEFAULT_DATASET_ROOT / ".git").exists(),
    reason="Pinned external TOEFL-Spell clone is not available",
)
def test_pinned_external_source_rebuilds_checked_in_manifest_exactly():
    rebuilt = build_manifest_document(
        dataset_root=DEFAULT_DATASET_ROOT,
        wordbook_path=DEFAULT_WORDBOOK_PATH,
    )

    assert rebuilt == load_checked_in_manifest()


def test_cli_exposes_prepare_verify_provider_off_baseline_and_current_modes():
    parser = build_parser()

    assert parser.parse_args(["prepare"]).command == "prepare"
    assert parser.parse_args(["verify"]).command == "verify"
    baseline = parser.parse_args(
        ["baseline", "--split", "held-out", "--provider-off"]
    )
    assert baseline.command == "baseline"
    assert baseline.split == "held-out"
    assert baseline.provider_off is True
    current = parser.parse_args(
        ["current", "--mode", "calibration", "--provider-off"]
    )
    assert current.command == "current"
    assert current.mode == "calibration"
    assert current.provider_off is True
    assert CURRENT_CANDIDATE_LIMIT == 8
    replay = parser.parse_args(
        [
            "replay-policy",
            "--calibration-cases",
            "cases.jsonl",
            "--calibration-metrics",
            "metrics.json",
            "--calibration-cases-sha256",
            "a" * 64,
            "--calibration-metrics-sha256",
            "b" * 64,
            "--output-dir",
            "replay-output",
        ]
    )
    assert replay.command == "replay-policy"


def test_current_cli_rejects_missing_explicit_provider_off_marker(capsys):
    assert main(["current", "--mode", "calibration"]) == 2
    assert "requires the explicit --provider-off marker" in capsys.readouterr().err


def test_current_forbids_limit_and_requires_each_full_pinned_split():
    with pytest.raises(benchmark_module.BenchmarkError, match="forbids --limit"):
        validate_current_run_selection(
            selected_split="held-out",
            limit=10,
            selected_case_count=EXPECTED_HELD_OUT_COUNT,
        )
    with pytest.raises(benchmark_module.BenchmarkError, match="case count mismatch"):
        validate_current_run_selection(
            selected_split="held-out",
            limit=None,
            selected_case_count=EXPECTED_HELD_OUT_COUNT - 1,
        )

    assert validate_current_run_selection(
        selected_split="held-out",
        limit=None,
        selected_case_count=EXPECTED_HELD_OUT_COUNT,
    ) is True
    with pytest.raises(benchmark_module.BenchmarkError, match="forbids --limit"):
        validate_current_run_selection(
            selected_split="calibration",
            limit=1,
            selected_case_count=EXPECTED_CALIBRATION_COUNT,
        )
    with pytest.raises(benchmark_module.BenchmarkError, match="calibration case count mismatch"):
        validate_current_run_selection(
            selected_split="calibration",
            limit=None,
            selected_case_count=EXPECTED_CALIBRATION_COUNT - 1,
        )
    assert validate_current_run_selection(
        selected_split="calibration",
        limit=None,
        selected_case_count=EXPECTED_CALIBRATION_COUNT,
    ) is False


def test_current_cli_does_not_expose_partial_limit():
    parser = build_parser()
    with pytest.raises(SystemExit):
        parser.parse_args(
            ["current", "--mode", "calibration", "--provider-off", "--limit", "1"]
        )


def test_heldout_one_shot_receipt_refuses_overwrite_and_records_completion(tmp_path):
    output_dir = tmp_path / "held-out"
    artifacts = current_artifact_paths(output_dir, "held-out")

    receipt = prepare_heldout_one_shot(
        output_dir=output_dir,
        artifacts=artifacts,
        canonical_output_dir=output_dir,
    )
    assert json.loads(receipt.read_text(encoding="utf-8"))["status"] == "started"

    with pytest.raises(benchmark_module.BenchmarkError, match="already exist"):
        prepare_heldout_one_shot(
            output_dir=output_dir,
            artifacts=artifacts,
            canonical_output_dir=output_dir,
        )

    complete_heldout_one_shot(
        receipt,
        {"gateSummary": {"allPassed": False, "finalGatePassed": False}},
    )
    completed = json.loads(receipt.read_text(encoding="utf-8"))
    assert completed["status"] == "completed"
    assert completed["finalGatePassed"] is False


def test_heldout_cli_forbids_custom_output_directory(capsys, tmp_path):
    assert main(
        [
            "current",
            "--mode",
            "held-out",
            "--provider-off",
            "--output-dir",
            str(tmp_path),
        ]
    ) == 2
    assert "--output-dir is forbidden" in capsys.readouterr().err


def test_source_versions_pin_runner_candidate_and_decision_files():
    versions = benchmark_source_versions()
    assert set(versions) == {"benchmarkRunner", "candidateProvider", "decisionPolicy"}
    assert all(len(value["sha256"]) == 64 for value in versions.values())


def test_process_rss_measurement_uses_only_the_standard_library():
    rss = process_rss_bytes()
    assert isinstance(rss, int)
    assert rss > 0


def test_checked_in_quality_fixtures_cover_all_protected_sample_types_and_strata():
    fixtures = load_quality_fixtures(DEFAULT_QUALITY_FIXTURES_PATH)

    assert len(fixtures["ecdictSha256"]) == 64
    assert fixtures["neighborDensityDefinition"]["medium"] == "2-5 ECDICT neighbors"
    assert fixtures["validWords"]
    assert fixtures["ambiguousTypos"]
    assert fixtures["randomStrings"]
    assert fixtures["routeSlotCases"]
    assert {row["activeExamTarget"] for row in fixtures["validWords"]} == {
        "gaokao",
        "cet4",
        "cet6",
        "postgrad",
    }
    assert {row["stratum"]["neighborDensityBand"] for row in fixtures["validWords"]} == {
        "low",
        "medium",
        "high",
    }


def test_group_level_acceptable_golds_use_the_earliest_acceptable_candidate():
    assert first_acceptable_rank(
        ["affect", "effort", "afford"],
        ["afford", "effort"],
    ) == 2
    assert first_acceptable_rank(["affect"], ["afford", "effort"]) is None


def test_baseline_summary_keeps_route_slot_candidate_and_latency_separate():
    records = [
        {
            "split": "calibration",
            "stratumKey": "distance=1|length=5-7|scope=cet4",
            "gold": "because",
            "route": {"correct": True},
            "slot": {"exact": True, "tokenF1": 1.0},
            "candidate": {"goldRank": 1, "generationLatencyMs": 0.1},
            "outcome": {
                "selectedLemmas": ["because"],
                "providerCalled": False,
                "resolution": "resolved",
                "noMatchReason": None,
                "statusCode": 200,
            },
            "latencyMs": {"route": 0.2, "toolExecution": 1.0, "total": 1.2},
            "error": None,
        },
        {
            "split": "held-out",
            "stratumKey": "distance=2|length=8-10|scope=gaokao",
            "gold": "different",
            "route": {"correct": True},
            "slot": {"exact": False, "tokenF1": 0.5},
            "candidate": {"goldRank": 4, "generationLatencyMs": None},
            "outcome": {
                "selectedLemmas": [],
                "providerCalled": False,
                "resolution": "no_match",
                "noMatchReason": "out_of_kb",
                "statusCode": 200,
            },
            "latencyMs": {"route": 0.4, "toolExecution": 2.0, "total": 2.4},
            "error": None,
        },
    ]

    metrics = summarize_baseline_records(
        records,
        environment={"providerMode": "off"},
        selected_split="all",
        run_duration_ms=4.0,
    )

    assert metrics["quality"]["routeAccuracy"] == 1.0
    assert metrics["quality"]["slotExactAccuracy"] == 0.5
    assert metrics["quality"]["slotTokenF1"] == 0.75
    assert metrics["quality"]["candidateRecallAtK"] == {
        "1": 0.5,
        "3": 0.5,
        "5": 1.0,
    }
    assert metrics["quality"]["candidateMRR"] == pytest.approx(0.625)
    assert metrics["latencyMs"]["candidateGeneration"]["count"] == 1
    assert metrics["outcomes"]["resolutionCounts"] == {
        "no_match": 1,
        "resolved": 1,
    }


def test_current_summary_separates_decision_negative_samples_strata_and_resource_gates():
    typo_records = [
        {
            "split": "calibration",
            "stratumKey": "distance=1|length=5-7|scope=gaokao",
            "stratum": {"editDistanceBand": "1", "goldLengthBand": "5-7"},
            "activeExamTarget": "gaokao",
            "gold": "afford",
            "acceptableGolds": ["afford", "effort"],
            "route": {"correct": True},
            "slot": {"exact": True, "tokenF1": 1.0},
            "candidate": {
                "goldRank": 2,
                "scopeOutcome": "active_scope",
                "generationLatencyMs": 10.0,
            },
            "decision": {
                "kind": "auto_correct",
                "reasonCode": "high_confidence",
                "correct": True,
                "latencyMs": 0.1,
            },
            "outcome": {
                "selectedLemmas": ["effort"],
                "providerCalled": False,
                "providerOutcome": "not_configured",
                "recoveryKind": "none",
                "resolution": "resolved",
                "noMatchReason": None,
            },
            "latencyMs": {"route": 0.2, "toolExecution": 1.0, "total": 11.2},
            "error": None,
        },
        {
            "split": "calibration",
            "stratumKey": "distance=2|length=8-10|scope=cet6",
            "stratum": {"editDistanceBand": "2", "goldLengthBand": "8-10"},
            "activeExamTarget": "cet6",
            "gold": "different",
            "acceptableGolds": ["different"],
            "route": {"correct": True},
            "slot": {"exact": True, "tokenF1": 1.0},
            "candidate": {
                "goldRank": None,
                "scopeOutcome": "unrecalled",
                "generationLatencyMs": 20.0,
            },
            "decision": {
                "kind": "no_reliable_candidate",
                "reasonCode": "no_reliable_candidate",
                "correct": False,
                "latencyMs": 0.2,
            },
            "outcome": {
                "selectedLemmas": [],
                "providerCalled": False,
                "providerOutcome": "not_configured",
                "recoveryKind": "none",
                "resolution": "no_match",
                "noMatchReason": "no_reliable_candidate",
            },
            "latencyMs": {"route": 0.3, "toolExecution": 1.5, "total": 21.8},
            "error": None,
        },
    ]
    fixture_records = [
        {
            "caseType": "valid_word",
            "activeExamTarget": "gaokao",
            "stratum": {"lengthBand": "<=4", "neighborDensityBand": "high"},
            "candidate": {"inputIsKnownWord": True},
            "expectedDecision": "no_reliable_candidate",
            "decision": {"kind": "no_reliable_candidate"},
        },
        {
            "caseType": "ambiguous_typo",
            "activeExamTarget": "gaokao",
            "expectedDecision": "clarify_candidates",
            "decision": {"kind": "clarify_candidates"},
        },
        {
            "caseType": "random_string",
            "activeExamTarget": "cet6",
            "candidate": {"inputIsKnownWord": False},
            "expectedDecision": "no_reliable_candidate",
            "decision": {"kind": "no_reliable_candidate"},
        },
    ]
    route_records = [
        {
            "route": {"correct": True},
            "slot": {"exact": True, "tokenF1": 1.0},
        }
    ]

    metrics = summarize_current_records(
        typo_records,
        fixture_records,
        route_records,
        environment={"generatedAtUtc": "2026-07-17T00:00:00Z"},
        selected_split="calibration",
        run_duration_ms=40.0,
        cold_load={
            "candidateIndexRssDeltaBytes": 1024,
            "ecdictColdLoadMs": 5.0,
            "candidateColdLoadMs": 1.0,
        },
    )

    assert metrics["quality"]["candidateRecallAtK"]["3"] == 0.5
    assert metrics["quality"]["finalGoldSelectionRate"] == 0.5
    assert metrics["quality"]["autoCorrectionPrecision"] == 1.0
    assert metrics["quality"]["autoCorrectionCoverage"] == 0.5
    assert metrics["negativeAndContractSamples"]["validWord"]["falseCorrectionRate"] == 0
    assert metrics["negativeAndContractSamples"]["randomString"]["autoCorrectionRate"] == 0
    assert metrics["negativeAndContractSamples"]["ambiguous"]["clarificationRate"] == 1
    assert set(metrics["byExamTarget"]) == {"cet6", "gaokao"}
    assert metrics["outcomes"]["resolutionNoMatchMatrix"] == {
        "no_match": {"no_reliable_candidate": 1},
        "resolved": {"none": 1},
    }
    assert metrics["gates"]["warmCandidateP95Ms"]["passed"] is True
    assert metrics["gates"]["candidateIndexRssDeltaBytes"]["passed"] is True
    assert metrics["gates"]["autoCorrectionPrecision"]["evaluated"] is True
    assert metrics["gates"]["autoCorrectionPrecision"]["passed"] is True
    assert metrics["gates"]["candidateRecallAt3"]["evaluated"] is True
    assert metrics["gates"]["candidateRecallAt3"]["passed"] is False
    assert metrics["gates"]["candidateRecallAt3"]["evaluatedOnFinalGate"] is False
    assert metrics["gateSummary"]["allPassed"] is False
    assert metrics["gateSummary"]["readinessPassed"] is None
    assert metrics["gateSummary"]["finalGatePassed"] is None
    assert metrics["gateSummary"]["fullCalibrationSplit"] is False
    assert metrics["gates"]["selectedSplitCaseCount"]["passed"] is False

    bad_precision_records = list(typo_records)
    bad_precision_records[0] = {
        **typo_records[0],
        "decision": {**typo_records[0]["decision"], "correct": False},
    }
    readiness = summarize_current_records(
        bad_precision_records,
        fixture_records,
        route_records,
        environment={"generatedAtUtc": "2026-07-17T00:00:00Z"},
        selected_split="calibration",
        run_duration_ms=40.0,
        cold_load={
            "candidateIndexRssDeltaBytes": 1024,
            "ecdictColdLoadMs": 5.0,
            "candidateColdLoadMs": 1.0,
        },
    )
    assert readiness["quality"]["autoCorrectionPrecision"] == 0.0
    assert readiness["gates"]["autoCorrectionPrecision"]["passed"] is False
    assert readiness["gateSummary"]["allPassed"] is False
    assert readiness["gateSummary"]["readinessPassed"] is None
    assert readiness["gateSummary"]["finalGatePassed"] is None


def _heldout_typo_record():
    return {
        "split": "held-out",
        "stratumKey": "distance=1|length=5-7|scope=gaokao",
        "stratum": {"editDistanceBand": "1", "goldLengthBand": "5-7"},
        "activeExamTarget": "gaokao",
        "gold": "request",
        "acceptableGolds": ["request"],
        "route": {"correct": True},
        "slot": {"exact": True, "tokenF1": 1.0},
        "candidate": {
            "goldRank": 1,
            "scopeOutcome": "active_scope",
            "generationLatencyMs": 10.0,
        },
        "decision": {
            "kind": "no_reliable_candidate",
            "reasonCode": "no_reliable_candidate",
            "correct": False,
            "latencyMs": 0.1,
        },
        "outcome": {
            "selectedLemmas": [],
            "providerCalled": False,
            "providerOutcome": "not_configured",
            "recoveryKind": "none",
            "resolution": "no_match",
            "noMatchReason": "no_reliable_candidate",
        },
        "latencyMs": {"route": 0.2, "toolExecution": 1.0, "total": 11.2},
        "error": None,
    }


def _protected_fixture_records():
    return [
        {
            "caseType": "valid_word",
            "activeExamTarget": "gaokao",
            "stratum": {"lengthBand": "5-7", "neighborDensityBand": "medium"},
            "candidate": {"inputIsKnownWord": True},
            "expectedDecision": "no_reliable_candidate",
            "decision": {"kind": "no_reliable_candidate"},
        },
        {
            "caseType": "ambiguous_typo",
            "activeExamTarget": "gaokao",
            "expectedDecision": "clarify_candidates",
            "decision": {"kind": "clarify_candidates"},
        },
        {
            "caseType": "random_string",
            "activeExamTarget": "cet6",
            "candidate": {"inputIsKnownWord": False},
            "expectedDecision": "no_reliable_candidate",
            "decision": {"kind": "no_reliable_candidate"},
        },
    ]


def test_only_full_calibration_can_report_readiness_passed():
    calibration_record = {**_heldout_typo_record(), "split": "calibration"}
    metrics = summarize_current_records(
        [calibration_record] * EXPECTED_CALIBRATION_COUNT,
        _protected_fixture_records(),
        [{"route": {"correct": True}, "slot": {"exact": True, "tokenF1": 1.0}}],
        environment={"generatedAtUtc": "2026-07-17T00:00:00Z"},
        selected_split="calibration",
        run_duration_ms=100.0,
        cold_load={
            "candidateIndexRssDeltaBytes": 1024,
            "ecdictColdLoadMs": 5.0,
            "candidateColdLoadMs": 1.0,
        },
    )

    assert metrics["gates"]["selectedSplitCaseCount"]["passed"] is True
    assert metrics["gateSummary"]["fullCalibrationSplit"] is True
    assert metrics["gateSummary"]["allPassed"] is True
    assert metrics["gateSummary"]["readinessPassed"] is True
    assert metrics["gateSummary"]["finalGatePassed"] is None


def test_full_heldout_is_the_only_final_gate_and_zero_auto_precision_is_vacuously_safe():
    typo_records = [_heldout_typo_record()] * EXPECTED_HELD_OUT_COUNT
    route_records = [
        {"route": {"correct": True}, "slot": {"exact": True, "tokenF1": 1.0}}
    ]
    metrics = summarize_current_records(
        typo_records,
        _protected_fixture_records(),
        route_records,
        environment={"generatedAtUtc": "2026-07-17T00:00:00Z"},
        selected_split="held-out",
        run_duration_ms=100.0,
        cold_load={
            "candidateIndexRssDeltaBytes": 1024,
            "ecdictColdLoadMs": 5.0,
            "candidateColdLoadMs": 1.0,
        },
    )

    assert metrics["quality"]["autoCorrectionPrecision"] is None
    assert metrics["gates"]["autoCorrectionPrecision"]["passed"] is True
    assert "coverage_has_no_minimum" in metrics["gates"]["autoCorrectionPrecision"][
        "zeroAutoCorrectionPolicy"
    ]
    assert metrics["gates"]["candidateRecallAt3"]["evaluatedOnFinalGate"] is True
    assert metrics["gateSummary"] == {
        "allPassed": True,
        "readinessPassed": None,
        "finalGatePassed": True,
        "fullCalibrationSplit": False,
        "fullHeldOutSplit": True,
        "evaluatedGateCount": metrics["gateSummary"]["totalGateCount"],
        "totalGateCount": metrics["gateSummary"]["totalGateCount"],
    }

    bad_records = list(typo_records)
    bad_records[0] = {**_heldout_typo_record(), "route": {"correct": False}}
    failed = summarize_current_records(
        bad_records,
        _protected_fixture_records(),
        route_records,
        environment={"generatedAtUtc": "2026-07-17T00:00:00Z"},
        selected_split="held-out",
        run_duration_ms=100.0,
        cold_load={
            "candidateIndexRssDeltaBytes": 1024,
            "ecdictColdLoadMs": 5.0,
            "candidateColdLoadMs": 1.0,
        },
    )
    assert failed["gates"]["mainSplitRouteAccuracy"]["passed"] is False
    assert failed["gateSummary"]["allPassed"] is False
    assert failed["gateSummary"]["finalGatePassed"] is False

    bad_fixtures = _protected_fixture_records()
    bad_fixtures[0] = {
        **bad_fixtures[0],
        "candidate": {"inputIsKnownWord": False},
    }
    bad_fixtures[1] = {
        **bad_fixtures[1],
        "decision": {"kind": "auto_correct"},
    }
    bad_fixtures[2] = {
        **bad_fixtures[2],
        "candidate": {"inputIsKnownWord": True},
    }
    fixture_failed = summarize_current_records(
        typo_records,
        bad_fixtures,
        route_records,
        environment={"generatedAtUtc": "2026-07-17T00:00:00Z"},
        selected_split="held-out",
        run_duration_ms=100.0,
        cold_load={
            "candidateIndexRssDeltaBytes": 1024,
            "ecdictColdLoadMs": 5.0,
            "candidateColdLoadMs": 1.0,
        },
    )
    assert fixture_failed["gates"]["validWordProtectionRate"]["passed"] is False
    assert fixture_failed["gates"]["ambiguousClarificationRate"]["passed"] is False
    assert fixture_failed["gates"]["randomStringProtectionRate"]["passed"] is False
    assert fixture_failed["gateSummary"]["finalGatePassed"] is False


def test_cli_returns_nonzero_after_failed_heldout_but_not_calibration_gates(
    monkeypatch,
    capsys,
    tmp_path,
):
    artifacts = {
        "jsonl": tmp_path / "cases.jsonl",
        "metrics": tmp_path / "metrics.json",
        "markdown": tmp_path / "summary.md",
    }

    def fake_run_current(**kwargs):
        final = kwargs["selected_split"] == "held-out"
        return (
            {
                "quality": {},
                "gates": {},
                "gateSummary": {
                    "allPassed": False,
                    "finalGatePassed": False if final else None,
                },
            },
            artifacts,
        )

    monkeypatch.setattr(benchmark_module, "run_current", fake_run_current)
    assert benchmark_module.main(
        ["current", "--mode", "held-out", "--provider-off"]
    ) == 3
    assert "artifacts were preserved" in capsys.readouterr().err

    assert benchmark_module.main(
        [
            "current",
            "--mode",
            "calibration",
            "--provider-off",
            "--output-dir",
            str(tmp_path),
        ]
    ) == 0


def test_cli_returns_nonzero_after_failed_policy_replay(
    monkeypatch,
    capsys,
    tmp_path,
):
    artifacts = {
        "json": tmp_path / "policy-replay.json",
        "markdown": tmp_path / "policy-replay.md",
    }

    def fake_run_policy_replay(**_kwargs):
        return (
            {
                "decisionReplay": {},
                "readiness": {"passed": False, "gates": {}},
            },
            artifacts,
        )

    monkeypatch.setattr(
        benchmark_module,
        "run_policy_replay",
        fake_run_policy_replay,
    )

    assert benchmark_module.main(
        [
            "replay-policy",
            "--calibration-cases",
            str(tmp_path / "cases.jsonl"),
            "--calibration-metrics",
            str(tmp_path / "metrics.json"),
            "--calibration-cases-sha256",
            "0" * 64,
            "--calibration-metrics-sha256",
            "1" * 64,
            "--output-dir",
            str(tmp_path / "output"),
        ]
    ) == 3
    assert "policy replay completed" in capsys.readouterr().err


def _serialized_candidate(lemma="request", distance=1, rank=1):
    return {
        "rank": rank,
        "lemma": lemma,
        "editDistance": distance,
        "inActiveExamScope": True,
        "scopeCodes": ["cet4"],
        "sourceKind": "compact_wordbook",
        "reasonCodes": [f"edit_distance_{distance}", "active_exam_scope"],
        "rankKey": [distance, 0, lemma],
    }


def _policy_replay_record(index):
    return {
        "caseType": "typo",
        "caseIndex": index,
        "id": f"calibration-{index:03d}",
        "typo": "reqeust",
        "gold": "request",
        "acceptableGolds": ["request"],
        "split": "calibration",
        "candidate": {
            "status": "ready",
            "inputIsKnownWord": False,
            "globalCompetitionComplete": True,
            "lexiconVersion": "fixture-v1",
            "items": [_serialized_candidate()],
            "goldRank": 1,
            "generationLatencyMs": 10.0,
        },
        "decision": {
            "kind": "auto_correct",
            "reasonCode": "high_confidence",
            "selectedLemmas": ["request"],
            "correct": True,
        },
        "outcome": {
            "providerCalled": False,
            "providerOutcome": "not_configured",
            "recoveryKind": "none",
        },
        "error": None,
    }


def _policy_replay_fixture_records():
    valid = [
        {
            "caseType": "valid_word",
            "id": f"valid-{index}",
            "term": "request",
            "expectedDecision": "no_reliable_candidate",
            "candidate": {
                "status": "ready",
                "inputIsKnownWord": True,
                "globalCompetitionComplete": True,
                "items": [_serialized_candidate("requested")],
            },
            "outcome": {"providerCalled": False},
            "error": None,
        }
        for index in range(12)
    ]
    ambiguous = [
        {
            "caseType": "ambiguous_typo",
            "id": f"ambiguous-{index}",
            "term": "frorm",
            "expectedDecision": "clarify_candidates",
            "candidate": {
                "status": "ready",
                "inputIsKnownWord": False,
                "globalCompetitionComplete": True,
                "items": [
                    _serialized_candidate("form", rank=1),
                    _serialized_candidate("from", rank=2),
                ],
            },
            "outcome": {"providerCalled": False},
            "error": None,
        }
        for index in range(3)
    ]
    random_rows = [
        {
            "caseType": "random_string",
            "id": f"random-{index}",
            "term": "xqzplm",
            "expectedDecision": "no_reliable_candidate",
            "candidate": {
                "status": "ready",
                "inputIsKnownWord": False,
                "globalCompetitionComplete": True,
                "items": [],
            },
            "outcome": {"providerCalled": False},
            "error": None,
        }
        for index in range(4)
    ]
    route_rows = [
        {
            "caseType": "route_slot",
            "id": f"route-{index}",
            "route": {"correct": True},
            "slot": {"exact": True, "tokenF1": 1.0},
            "error": None,
        }
        for index in range(4)
    ]
    return [*valid, *ambiguous, *random_rows, *route_rows]


def _write_policy_replay_inputs(tmp_path, typo_count=EXPECTED_CALIBRATION_COUNT):
    tmp_path.mkdir(parents=True, exist_ok=True)
    cases_path = tmp_path / "round3-calibration-cases.jsonl"
    records = [
        *[_policy_replay_record(index) for index in range(1, typo_count + 1)],
        *_policy_replay_fixture_records(),
    ]
    cases_path.write_text(
        "".join(json.dumps(record, separators=(",", ":")) + "\n" for record in records),
        encoding="utf-8",
    )
    metrics_path = tmp_path / "round3-calibration-metrics.json"
    metrics = {
        "schemaVersion": "spelling-recovery-benchmark-metrics-v2",
        "runMode": "current",
        "selectedSplit": "calibration",
        "quality": {
            "totalCases": typo_count,
            "providerCalledCount": 0,
            "errorCount": 0,
            "candidateRecallAtK": {"1": 1.0, "3": 1.0, "5": 1.0},
        },
        "latencyMs": {
            "candidateGeneration": {"p95": 10.0},
            "coldLoad": {"candidateIndexRssDeltaBytes": 1024},
        },
        "gates": {
            name: {"passed": True, "actual": 1.0, "threshold": 1.0}
            for name in (
                "mainSplitRouteAccuracy",
                "mainSplitSlotExactAccuracy",
                "mainSplitSlotTokenF1",
                "fixedFixtureRouteAccuracy",
                "fixedFixtureSlotExactAccuracy",
                "fixedFixtureSlotTokenF1",
                "providerCalledCount",
                "runnerErrorCount",
                "selectedSplitCaseCount",
            )
        },
        "gateSummary": {
            "fullCalibrationSplit": typo_count == EXPECTED_CALIBRATION_COUNT,
        },
        "environment": {"providerMode": "off", "structuredRuntime": False},
    }
    metrics_path.write_text(json.dumps(metrics), encoding="utf-8")
    return cases_path, metrics_path


def test_replay_policy_cli_requires_explicit_artifact_hashes(tmp_path):
    parser = build_parser()
    with pytest.raises(SystemExit):
        parser.parse_args(
            [
                "replay-policy",
                "--calibration-cases",
                str(tmp_path / "cases.jsonl"),
                "--calibration-metrics",
                str(tmp_path / "metrics.json"),
                "--output-dir",
                str(tmp_path / "output"),
            ]
        )


def test_offline_policy_replay_validates_and_writes_independent_json_and_markdown(
    tmp_path,
    monkeypatch,
):
    cases_path, metrics_path = _write_policy_replay_inputs(tmp_path)

    def provider_must_not_run(*args, **kwargs):
        raise AssertionError("candidate provider must not run during offline replay")

    monkeypatch.setattr(
        "backend.app.retrieval.spelling_candidates.EcdictSpellingCandidateProvider.generate",
        provider_must_not_run,
    )
    output_dir = tmp_path / "policy-replay"
    result, artifacts = run_policy_replay(
        calibration_cases_path=cases_path,
        calibration_metrics_path=metrics_path,
        expected_cases_sha256=sha256_file(cases_path),
        expected_metrics_sha256=sha256_file(metrics_path),
        output_dir=output_dir,
    )

    assert artifacts == replay_policy_artifact_paths(output_dir)
    assert artifacts["json"].exists()
    assert artifacts["markdown"].exists()
    assert result["inputValidation"]["typoCaseCount"] == EXPECTED_CALIBRATION_COUNT
    assert result["baseArtifacts"]["casesJsonl"]["sha256"] == sha256_file(cases_path)
    assert len(result["policySource"]["sha256"]) == 64
    assert result["decisionReplay"]["autoCorrectionCount"] == EXPECTED_CALIBRATION_COUNT
    assert result["decisionReplay"]["autoCorrectionPrecision"] == 1.0
    assert result["decisionReplay"]["autoCorrectionCoverage"] == 1.0
    assert result["inheritedEvidence"]["candidateRecallAt3"]["value"] == 1.0
    assert result["readiness"]["passed"] is True
    assert "held-out" not in artifacts["markdown"].read_text(encoding="utf-8").lower()


def test_policy_replay_rejects_hash_mismatch_before_parsing(tmp_path):
    cases_path = tmp_path / "round3-calibration-cases.jsonl"
    cases_path.write_text("not json\n", encoding="utf-8")
    metrics_path = tmp_path / "round3-calibration-metrics.json"
    metrics_path.write_text("{}", encoding="utf-8")

    with pytest.raises(benchmark_module.BenchmarkError, match="cases SHA-256 mismatch"):
        validate_policy_replay_artifacts(
            calibration_cases_path=cases_path,
            calibration_metrics_path=metrics_path,
            expected_cases_sha256="0" * 64,
            expected_metrics_sha256=sha256_file(metrics_path),
        )

    valid_cases, valid_metrics = _write_policy_replay_inputs(tmp_path / "valid")
    with pytest.raises(benchmark_module.BenchmarkError, match="metrics SHA-256 mismatch"):
        validate_policy_replay_artifacts(
            calibration_cases_path=valid_cases,
            calibration_metrics_path=valid_metrics,
            expected_cases_sha256=sha256_file(valid_cases),
            expected_metrics_sha256="0" * 64,
        )


def test_policy_replay_rejects_partial_calibration_and_heldout_paths_without_output(tmp_path):
    cases_path, metrics_path = _write_policy_replay_inputs(
        tmp_path,
        typo_count=EXPECTED_CALIBRATION_COUNT - 1,
    )
    with pytest.raises(benchmark_module.BenchmarkError, match="exactly 481 typo"):
        validate_policy_replay_artifacts(
            calibration_cases_path=cases_path,
            calibration_metrics_path=metrics_path,
            expected_cases_sha256=sha256_file(cases_path),
            expected_metrics_sha256=sha256_file(metrics_path),
        )

    heldout_path = tmp_path / "held-out-cases.jsonl"
    heldout_path.write_text("do not read", encoding="utf-8")
    with pytest.raises(benchmark_module.BenchmarkError, match="held-out paths are forbidden"):
        validate_policy_replay_artifacts(
            calibration_cases_path=heldout_path,
            calibration_metrics_path=metrics_path,
            expected_cases_sha256=sha256_file(heldout_path),
            expected_metrics_sha256=sha256_file(metrics_path),
        )

    with pytest.raises(benchmark_module.BenchmarkError, match="outside current benchmark"):
        validate_replay_output_dir(DEFAULT_CURRENT_OUTPUT_ROOT / "calibration" / "replay")


@pytest.mark.parametrize(
    ("mutation", "expected_error"),
    [
        ("provider", "provider calls"),
        ("error", "runner errors"),
        ("split", "split=calibration"),
    ],
)
def test_policy_replay_rejects_unsafe_calibration_rows(tmp_path, mutation, expected_error):
    cases_path, metrics_path = _write_policy_replay_inputs(tmp_path)
    lines = cases_path.read_text(encoding="utf-8").splitlines()
    first = json.loads(lines[0])
    if mutation == "provider":
        first["outcome"]["providerCalled"] = True
    elif mutation == "error":
        first["error"] = "boom"
    else:
        first["split"] = "held-out"
    lines[0] = json.dumps(first, separators=(",", ":"))
    cases_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    with pytest.raises(benchmark_module.BenchmarkError, match=expected_error):
        validate_policy_replay_artifacts(
            calibration_cases_path=cases_path,
            calibration_metrics_path=metrics_path,
            expected_cases_sha256=sha256_file(cases_path),
            expected_metrics_sha256=sha256_file(metrics_path),
        )
