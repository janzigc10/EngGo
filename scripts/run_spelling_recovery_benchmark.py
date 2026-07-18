from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import os
import platform
import re
import subprocess
import sys
import time
from collections import Counter, defaultdict
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Sequence


REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
DEFAULT_DATASET_ROOT = Path(r"C:\tmp\TOEFL-Spell")
DEFAULT_MANIFEST_PATH = (
    REPO_ROOT / "data" / "evals" / "spelling-recovery-v1" / "manifest.json"
)
DEFAULT_WORDBOOK_PATH = (
    REPO_ROOT / "data" / "exam-vocab" / "ecdict-wordbook" / "entries.json"
)
DEFAULT_ECDICT_PATH = REPO_ROOT / "output" / "external-dictionaries" / "ecdict.csv"
DEFAULT_SOURCE_LEMMA_DIR = REPO_ROOT / "data" / "exam-vocab"
DEFAULT_OUTPUT_DIR = REPO_ROOT / ".runlogs" / "spelling-recovery-v1" / "baseline"
DEFAULT_CURRENT_OUTPUT_ROOT = REPO_ROOT / ".runlogs" / "spelling-recovery-v1" / "current"
DEFAULT_QUALITY_FIXTURES_PATH = (
    REPO_ROOT / "data" / "evals" / "spelling-recovery-v1" / "quality-fixtures.json"
)

UPSTREAM_REPOSITORY = "https://github.com/EducationalTestingService/TOEFL-Spell"
UPSTREAM_COMMIT = "252ee893b75dbf6186facf9ffda5fc4bc5dc9eca"
UPSTREAM_INPUT = "Annotations.tsv"
UPSTREAM_SHA256 = "2efdf7a3c0d0a73d6550a1fbb40e8bec27dd6c004d417950c4571f80a6f85795"
EXPECTED_WORDBOOK_COUNT = 7_348
EXPECTED_WORDBOOK_SHA256 = "d11514cae71d3da67311833aabeca8f06df65cbd80cb98c38a6e034617382d84"
EXPECTED_PAIR_COUNT = 2_405
EXPECTED_CALIBRATION_COUNT = 481
EXPECTED_HELD_OUT_COUNT = 1_924
EXPECTED_UNIQUE_TYPO_COUNT = 2_384
EXPECTED_COLLISION_GROUP_COUNT = 17
EXPECTED_COLLISION_PAIR_COUNT = 38
EXPECTED_PAIR_SET_SHA256 = "fbf50802a5a55ff59d9364fd3aa5c3706e84c80f7d39defa150c310334e14e00"
SPLIT_SEED = 20_260_717
SCHEMA_VERSION = "spelling-recovery-benchmark-manifest-v1"
QUALITY_FIXTURES_SCHEMA_VERSION = "spelling-recovery-quality-fixtures-v1"
SPLIT_ALGORITHM = "typo-grouped-greedy-stratified-v1"
PAIR_SERIALIZATION = "sorted lowercase typo<TAB>gold<LF>, UTF-8"
TOKEN_PATTERN = re.compile(r"^[A-Za-z]+$")
SCOPE_ORDER = ("gaokao", "cet4", "cet6", "postgrad")
PROVIDER_ENV_KEYS = ("OPENAI_API_KEY", "OPENAI_BASE_URL", "OPENAI_MODEL")
CURRENT_CANDIDATE_LIMIT = 8
HELD_OUT_ONE_SHOT_RECEIPT = "held-out-one-shot-receipt.json"


class BenchmarkError(RuntimeError):
    """Raised when a pinned benchmark contract cannot be reproduced."""


def current_artifact_paths(output_dir: Path, selected_split: str) -> dict[str, Path]:
    artifact_prefix = f"current-{selected_split}"
    return {
        "jsonl": output_dir / f"{artifact_prefix}-cases.jsonl",
        "metrics": output_dir / f"{artifact_prefix}-metrics.json",
        "markdown": output_dir / f"{artifact_prefix}-summary.md",
    }


def validate_current_run_selection(
    *,
    selected_split: str,
    limit: int | None,
    selected_case_count: int,
) -> bool:
    if selected_split not in {"calibration", "held-out"}:
        raise BenchmarkError("current --mode must be calibration or held-out")
    if limit is not None:
        raise BenchmarkError(
            "current forbids --limit; calibration requires all 481 cases and held-out requires all 1,924 cases",
        )
    expected_count = (
        EXPECTED_CALIBRATION_COUNT
        if selected_split == "calibration"
        else EXPECTED_HELD_OUT_COUNT
    )
    if selected_case_count != expected_count:
        raise BenchmarkError(
            f"{selected_split} case count mismatch: "
            f"expected {expected_count}, got {selected_case_count}",
        )
    return selected_split == "held-out"


def prepare_heldout_one_shot(
    *,
    output_dir: Path,
    artifacts: dict[str, Path],
    canonical_output_dir: Path | None = None,
) -> Path:
    canonical = canonical_output_dir or (DEFAULT_CURRENT_OUTPUT_ROOT / "held-out")
    if output_dir.resolve() != canonical.resolve():
        raise BenchmarkError(
            "held-out output directory is fixed to preserve the one-shot result: "
            f"{canonical.resolve()}",
        )

    receipt_path = output_dir / HELD_OUT_ONE_SHOT_RECEIPT
    blockers = [receipt_path, *artifacts.values()]
    existing = [path for path in blockers if path.exists()]
    if existing:
        raise BenchmarkError(
            "held-out one-shot artifacts already exist; refusing to overwrite or rerun: "
            + ", ".join(str(path.resolve()) for path in existing),
        )

    output_dir.mkdir(parents=True, exist_ok=True)
    receipt = {
        "schemaVersion": "spelling-recovery-heldout-one-shot-v1",
        "status": "started",
        "startedAtUtc": utc_now_iso(),
        "artifacts": {key: str(path.resolve()) for key, path in artifacts.items()},
    }
    try:
        with receipt_path.open("x", encoding="utf-8", newline="\n") as handle:
            handle.write(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
    except FileExistsError as error:
        raise BenchmarkError(
            f"held-out one-shot receipt already exists: {receipt_path.resolve()}",
        ) from error
    return receipt_path


def complete_heldout_one_shot(receipt_path: Path, metrics: dict[str, Any]) -> None:
    receipt = load_json(receipt_path)
    receipt.update(
        {
            "status": "completed",
            "completedAtUtc": utc_now_iso(),
            "allPassed": metrics["gateSummary"]["allPassed"],
            "finalGatePassed": metrics["gateSummary"]["finalGatePassed"],
        }
    )
    write_json(receipt_path, receipt)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def sha256_bytes(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def benchmark_source_versions() -> dict[str, dict[str, str]]:
    sources = {
        "benchmarkRunner": Path(__file__).resolve(),
        "candidateProvider": REPO_ROOT / "backend" / "app" / "retrieval" / "spelling_candidates.py",
        "decisionPolicy": REPO_ROOT / "backend" / "app" / "retrieval" / "spelling_decision.py",
    }
    return {
        name: {
            "path": str(path.relative_to(REPO_ROOT)).replace("\\", "/"),
            "sha256": sha256_file(path),
        }
        for name, path in sources.items()
    }


def json_file_sha256(path: Path) -> str:
    return sha256_file(path)


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=False) + "\n",
        encoding="utf-8",
    )


def load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise BenchmarkError(f"Required JSON file not found: {path}") from error
    except json.JSONDecodeError as error:
        raise BenchmarkError(f"Invalid JSON in {path}: {error}") from error


def git_head(root: Path) -> str:
    try:
        completed = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=root,
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
    except (OSError, subprocess.CalledProcessError) as error:
        raise BenchmarkError(f"Cannot read git HEAD for {root}: {error}") from error
    return completed.stdout.strip().lower()


def repo_is_dirty(root: Path) -> bool:
    completed = subprocess.run(
        ["git", "status", "--porcelain"],
        cwd=root,
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    return bool(completed.stdout.strip())


def normalize_pair_token(value: str) -> str:
    return value.strip().lower()


def load_word_pool(wordbook_path: Path) -> tuple[dict[str, tuple[str, ...]], str]:
    raw = load_json(wordbook_path)
    if not isinstance(raw, list):
        raise BenchmarkError(f"Wordbook must be a JSON array: {wordbook_path}")

    scopes_by_lemma: dict[str, tuple[str, ...]] = {}
    for index, entry in enumerate(raw):
        if not isinstance(entry, dict):
            raise BenchmarkError(f"Wordbook entry {index} is not an object")
        lemma_value = entry.get("lemma")
        scope_values = entry.get("examScopes")
        if not isinstance(lemma_value, str) or not isinstance(scope_values, list):
            raise BenchmarkError(f"Wordbook entry {index} has invalid lemma/examScopes")
        lemma = normalize_pair_token(lemma_value)
        scopes = tuple(scope for scope in SCOPE_ORDER if scope in scope_values)
        if not lemma or not scopes:
            raise BenchmarkError(f"Wordbook entry {index} has no usable lemma/scope")
        if lemma in scopes_by_lemma:
            raise BenchmarkError(f"Duplicate wordbook lemma: {lemma}")
        scopes_by_lemma[lemma] = scopes

    if len(scopes_by_lemma) != EXPECTED_WORDBOOK_COUNT:
        raise BenchmarkError(
            "Wordbook count mismatch: "
            f"expected {EXPECTED_WORDBOOK_COUNT}, got {len(scopes_by_lemma)}"
        )
    return scopes_by_lemma, sha256_file(wordbook_path)


def read_filtered_pairs(
    annotations_path: Path,
    word_pool: dict[str, tuple[str, ...]],
) -> tuple[list[tuple[str, str]], dict[str, int]]:
    try:
        handle = annotations_path.open("r", encoding="utf-8", newline="")
    except FileNotFoundError as error:
        raise BenchmarkError(f"Pinned TOEFL-Spell input not found: {annotations_path}") from error

    with handle:
        reader = csv.DictReader(handle, delimiter="\t")
        expected_headers = {"Filename", "OffsetSpan", "Misspelling", "Type", "Correction"}
        if not reader.fieldnames or not expected_headers.issubset(set(reader.fieldnames)):
            raise BenchmarkError(
                f"Unexpected TOEFL-Spell headers in {annotations_path}: {reader.fieldnames}"
            )

        input_rows = 0
        filtered_rows = 0
        pairs: set[tuple[str, str]] = set()
        for row in reader:
            input_rows += 1
            misspelling_raw = (row.get("Misspelling") or "").strip()
            correction_raw = (row.get("Correction") or "").strip()
            if (row.get("Type") or "").strip() != "M":
                continue
            if not TOKEN_PATTERN.fullmatch(misspelling_raw):
                continue
            if not TOKEN_PATTERN.fullmatch(correction_raw):
                continue

            typo = normalize_pair_token(misspelling_raw)
            gold = normalize_pair_token(correction_raw)
            if typo == gold or gold not in word_pool:
                continue

            filtered_rows += 1
            pairs.add((typo, gold))

    sorted_pairs = sorted(pairs)
    return sorted_pairs, {
        "inputRows": input_rows,
        "filteredRowsBeforePairDedupe": filtered_rows,
        "deduplicatedPairCount": len(sorted_pairs),
    }


def osa_damerau_levenshtein(left: str, right: str) -> int:
    """Optimal-string-alignment distance; one adjacent transposition costs one."""

    if left == right:
        return 0
    if not left:
        return len(right)
    if not right:
        return len(left)

    rows = [[0] * (len(right) + 1) for _ in range(len(left) + 1)]
    for row_index in range(len(left) + 1):
        rows[row_index][0] = row_index
    for column_index in range(len(right) + 1):
        rows[0][column_index] = column_index

    for row_index in range(1, len(left) + 1):
        for column_index in range(1, len(right) + 1):
            substitution_cost = 0 if left[row_index - 1] == right[column_index - 1] else 1
            rows[row_index][column_index] = min(
                rows[row_index - 1][column_index] + 1,
                rows[row_index][column_index - 1] + 1,
                rows[row_index - 1][column_index - 1] + substitution_cost,
            )
            if (
                row_index > 1
                and column_index > 1
                and left[row_index - 1] == right[column_index - 2]
                and left[row_index - 2] == right[column_index - 1]
            ):
                rows[row_index][column_index] = min(
                    rows[row_index][column_index],
                    rows[row_index - 2][column_index - 2] + 1,
                )
    return rows[-1][-1]


def edit_distance_band(distance: int) -> str:
    if distance <= 1:
        return "1"
    if distance == 2:
        return "2"
    return "3+"


def gold_length_band(length: int) -> str:
    if length <= 4:
        return "<=4"
    if length <= 7:
        return "5-7"
    if length <= 10:
        return "8-10"
    return "11+"


def pair_id(typo: str, gold: str) -> str:
    raw = f"toefl-spell-v1\0{typo}\0{gold}".encode("utf-8")
    return f"pair-{sha256_bytes(raw)}"


def collision_group_id(typo: str) -> str:
    raw = f"toefl-spell-v1-typo\0{typo}".encode("utf-8")
    return f"typo-{sha256_bytes(raw)}"


def stable_group_order(seed: int, typo: str) -> int:
    return int.from_bytes(
        hashlib.sha256(f"{seed}\0{typo}".encode("utf-8")).digest(),
        byteorder="big",
    )


def serialize_pairs(pairs: Iterable[tuple[str, str]]) -> bytes:
    return "".join(f"{typo}\t{gold}\n" for typo, gold in sorted(pairs)).encode("utf-8")


def build_case_records(
    pairs: list[tuple[str, str]],
    scopes_by_lemma: dict[str, tuple[str, ...]],
) -> list[dict[str, Any]]:
    golds_by_typo: dict[str, list[str]] = defaultdict(list)
    for typo, gold in pairs:
        golds_by_typo[typo].append(gold)

    records: list[dict[str, Any]] = []
    for typo, gold in pairs:
        direct_scopes = scopes_by_lemma[gold]
        primary_scope = next(scope for scope in SCOPE_ORDER if scope in direct_scopes)
        distance = osa_damerau_levenshtein(typo, gold)
        distance_band = edit_distance_band(distance)
        length_band = gold_length_band(len(gold))
        stratum_key = f"distance={distance_band}|length={length_band}|scope={primary_scope}"
        acceptable_golds = sorted(set(golds_by_typo[typo]))
        records.append(
            {
                "id": pair_id(typo, gold),
                "typo": typo,
                "gold": gold,
                "acceptableGolds": acceptable_golds,
                "collisionGroupId": collision_group_id(typo),
                "collisionGroupSize": len(acceptable_golds),
                "activeExamTarget": primary_scope,
                "directExamScopes": list(direct_scopes),
                "stratum": {
                    "key": stratum_key,
                    "editDistance": distance,
                    "editDistanceBand": distance_band,
                    "goldLength": len(gold),
                    "goldLengthBand": length_band,
                    "primaryScope": primary_scope,
                },
            }
        )
    return records


def assign_grouped_stratified_split(cases: list[dict[str, Any]]) -> None:
    if len(cases) != EXPECTED_PAIR_COUNT:
        raise BenchmarkError(
            f"Cannot split unexpected pair count: {len(cases)} (expected {EXPECTED_PAIR_COUNT})"
        )

    cases_by_typo: dict[str, list[dict[str, Any]]] = defaultdict(list)
    stratum_totals: Counter[str] = Counter()
    for case in cases:
        cases_by_typo[case["typo"]].append(case)
        stratum_totals[case["stratum"]["key"]] += 1

    group_vectors: dict[str, Counter[str]] = {
        typo: Counter(case["stratum"]["key"] for case in group_cases)
        for typo, group_cases in cases_by_typo.items()
    }
    unassigned = set(cases_by_typo)
    calibration_typos: set[str] = set()
    calibration_counts: Counter[str] = Counter()
    remaining_slots = EXPECTED_CALIBRATION_COUNT

    while remaining_slots > 0:
        best: tuple[int, int, str] | None = None
        for typo in unassigned:
            group_size = len(cases_by_typo[typo])
            if group_size > remaining_slots:
                continue

            delta_score = 0
            for stratum_key, addition in group_vectors[typo].items():
                total = stratum_totals[stratum_key]
                current_error = (
                    calibration_counts[stratum_key] * EXPECTED_PAIR_COUNT
                    - total * EXPECTED_CALIBRATION_COUNT
                )
                next_error = (
                    (calibration_counts[stratum_key] + addition) * EXPECTED_PAIR_COUNT
                    - total * EXPECTED_CALIBRATION_COUNT
                )
                delta_score += next_error * next_error - current_error * current_error

            candidate = (delta_score, stable_group_order(SPLIT_SEED, typo), typo)
            if best is None or candidate < best:
                best = candidate

        if best is None:
            raise BenchmarkError(
                "Grouped split could not reach the exact calibration size; "
                f"{remaining_slots} slots remain"
            )

        typo = best[2]
        calibration_typos.add(typo)
        unassigned.remove(typo)
        calibration_counts.update(group_vectors[typo])
        remaining_slots -= len(cases_by_typo[typo])

    for case in cases:
        case["split"] = "calibration" if case["typo"] in calibration_typos else "held-out"


def build_stratum_summary(cases: list[dict[str, Any]]) -> dict[str, dict[str, int]]:
    summary: dict[str, dict[str, int]] = {}
    for case in cases:
        key = case["stratum"]["key"]
        row = summary.setdefault(key, {"total": 0, "calibration": 0, "held-out": 0})
        row["total"] += 1
        row[case["split"]] += 1
    return dict(sorted(summary.items()))


def build_manifest_document(
    *,
    dataset_root: Path,
    wordbook_path: Path,
) -> dict[str, Any]:
    dataset_root = dataset_root.resolve()
    wordbook_path = wordbook_path.resolve()
    annotations_path = dataset_root / UPSTREAM_INPUT

    actual_commit = git_head(dataset_root)
    if actual_commit != UPSTREAM_COMMIT:
        raise BenchmarkError(
            f"TOEFL-Spell commit mismatch: expected {UPSTREAM_COMMIT}, got {actual_commit}"
        )
    actual_source_hash = sha256_file(annotations_path)
    if actual_source_hash != UPSTREAM_SHA256:
        raise BenchmarkError(
            f"Annotations.tsv hash mismatch: expected {UPSTREAM_SHA256}, got {actual_source_hash}"
        )

    word_pool, wordbook_hash = load_word_pool(wordbook_path)
    if wordbook_hash != EXPECTED_WORDBOOK_SHA256:
        raise BenchmarkError(
            f"Wordbook hash mismatch: expected {EXPECTED_WORDBOOK_SHA256}, got {wordbook_hash}"
        )
    pairs, row_counts = read_filtered_pairs(annotations_path, word_pool)
    pair_set_hash = sha256_bytes(serialize_pairs(pairs))
    if len(pairs) != EXPECTED_PAIR_COUNT:
        raise BenchmarkError(
            f"Filtered pair count mismatch: expected {EXPECTED_PAIR_COUNT}, got {len(pairs)}"
        )
    if pair_set_hash != EXPECTED_PAIR_SET_SHA256:
        raise BenchmarkError(
            f"Filtered pair hash mismatch: expected {EXPECTED_PAIR_SET_SHA256}, got {pair_set_hash}"
        )

    cases = build_case_records(pairs, word_pool)
    assign_grouped_stratified_split(cases)
    typo_counts = Counter(case["typo"] for case in cases)
    collision_group_count = sum(count > 1 for count in typo_counts.values())
    collision_pair_count = sum(count for count in typo_counts.values() if count > 1)

    document = {
        "schemaVersion": SCHEMA_VERSION,
        "benchmarkId": "enggo-spelling-recovery-v1",
        "source": {
            "dataset": "TOEFL-Spell",
            "repository": UPSTREAM_REPOSITORY,
            "commit": UPSTREAM_COMMIT,
            "input": UPSTREAM_INPUT,
            "sha256": UPSTREAM_SHA256,
            **row_counts,
        },
        "attribution": {
            "creators": ["Michael Flor", "Michael Fried", "Alla Rozovskaya"],
            "work": "TOEFL-Spell: A dataset of spelling annotations for English language learner essays",
            "paper": "A Benchmark Corpus of English Misspellings and a Minimally-supervised Model for Spelling Correction (2019)",
            "license": "Creative Commons Attribution-ShareAlike 4.0",
            "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/",
            "upstreamRepository": UPSTREAM_REPOSITORY,
            "modifications": (
                "Filtered Type=M annotations to single ASCII-letter typo/correction pairs whose "
                "correction exists in EngGo's pinned 7,348-lemma wordbook; lowercased, pair-deduplicated, "
                "annotated with EngGo scope/strata metadata, and deterministically split."
            ),
        },
        "wordPool": {
            "path": "data/exam-vocab/ecdict-wordbook/entries.json",
            "entryCount": len(word_pool),
            "sha256": wordbook_hash,
            "scopeSemantics": "Direct examScopes; activeExamTarget uses the earliest direct scope in gaokao/cet4/cet6/postgrad order.",
        },
        "filter": {
            "type": "M",
            "tokenRegex": "^[A-Za-z]+$",
            "normalization": "strip then lowercase",
            "requiresGoldInWordPool": True,
            "excludesIdentityPairs": True,
            "dedupeKey": ["typo", "gold"],
        },
        "pairSet": {
            "count": len(pairs),
            "uniqueTypoCount": len(typo_counts),
            "collisionGroupCount": collision_group_count,
            "collisionPairCount": collision_pair_count,
            "serialization": PAIR_SERIALIZATION,
            "sha256": pair_set_hash,
        },
        "split": {
            "seed": SPLIT_SEED,
            "algorithm": SPLIT_ALGORITHM,
            "groupKey": "normalized typo",
            "stratification": [
                "OSA Damerau-Levenshtein distance band (1, 2, 3+)",
                "gold length band (<=4, 5-7, 8-10, 11+)",
                "primary direct exam scope",
            ],
            "calibrationCount": EXPECTED_CALIBRATION_COUNT,
            "heldOutCount": EXPECTED_HELD_OUT_COUNT,
            "contract": "All cases sharing a typo remain in one split; greedy squared-error allocation reaches the exact pair counts.",
        },
        "stratumSummary": build_stratum_summary(cases),
        "cases": cases,
    }
    verify_manifest_document(document)
    return document


def verify_manifest_document(document: Any) -> None:
    errors: list[str] = []
    if not isinstance(document, dict):
        raise BenchmarkError("Manifest root must be an object")
    if document.get("schemaVersion") != SCHEMA_VERSION:
        errors.append(f"schemaVersion must be {SCHEMA_VERSION}")

    source = document.get("source")
    if not isinstance(source, dict):
        errors.append("source must be an object")
    else:
        expected_source = {
            "repository": UPSTREAM_REPOSITORY,
            "commit": UPSTREAM_COMMIT,
            "input": UPSTREAM_INPUT,
            "sha256": UPSTREAM_SHA256,
            "deduplicatedPairCount": EXPECTED_PAIR_COUNT,
        }
        for key, expected in expected_source.items():
            if source.get(key) != expected:
                errors.append(f"source.{key} must be {expected!r}")

    attribution = document.get("attribution")
    if not isinstance(attribution, dict):
        errors.append("attribution must be an object")
    else:
        for key in ("creators", "work", "license", "licenseUrl", "modifications"):
            if not attribution.get(key):
                errors.append(f"attribution.{key} is required")

    word_pool = document.get("wordPool")
    if not isinstance(word_pool, dict):
        errors.append("wordPool must be an object")
    elif word_pool.get("entryCount") != EXPECTED_WORDBOOK_COUNT:
        errors.append(f"wordPool.entryCount must be {EXPECTED_WORDBOOK_COUNT}")
    elif word_pool.get("sha256") != EXPECTED_WORDBOOK_SHA256:
        errors.append(f"wordPool.sha256 must be {EXPECTED_WORDBOOK_SHA256}")

    cases = document.get("cases")
    if not isinstance(cases, list):
        errors.append("cases must be an array")
        cases = []
    if len(cases) != EXPECTED_PAIR_COUNT:
        errors.append(f"cases must contain {EXPECTED_PAIR_COUNT} rows, got {len(cases)}")

    seen_ids: set[str] = set()
    pairs: list[tuple[str, str]] = []
    splits_by_typo: dict[str, set[str]] = defaultdict(set)
    golds_by_typo: dict[str, set[str]] = defaultdict(set)
    observed_strata: dict[str, dict[str, int]] = {}
    split_counts: Counter[str] = Counter()

    for index, case in enumerate(cases):
        label = f"cases[{index}]"
        if not isinstance(case, dict):
            errors.append(f"{label} must be an object")
            continue
        typo = case.get("typo")
        gold = case.get("gold")
        if not isinstance(typo, str) or not isinstance(gold, str):
            errors.append(f"{label} typo/gold must be strings")
            continue
        if not TOKEN_PATTERN.fullmatch(typo) or typo != typo.lower():
            errors.append(f"{label}.typo is not normalized ASCII letters: {typo!r}")
        if not TOKEN_PATTERN.fullmatch(gold) or gold != gold.lower():
            errors.append(f"{label}.gold is not normalized ASCII letters: {gold!r}")

        expected_id = pair_id(typo, gold)
        if case.get("id") != expected_id:
            errors.append(f"{label}.id mismatch")
        if expected_id in seen_ids:
            errors.append(f"duplicate case id: {expected_id}")
        seen_ids.add(expected_id)
        pairs.append((typo, gold))
        golds_by_typo[typo].add(gold)

        expected_group_id = collision_group_id(typo)
        if case.get("collisionGroupId") != expected_group_id:
            errors.append(f"{label}.collisionGroupId mismatch")
        split = case.get("split")
        if split not in {"calibration", "held-out"}:
            errors.append(f"{label}.split is invalid: {split!r}")
        else:
            split_counts[split] += 1
            splits_by_typo[typo].add(split)

        stratum = case.get("stratum")
        if not isinstance(stratum, dict):
            errors.append(f"{label}.stratum must be an object")
            continue
        distance = osa_damerau_levenshtein(typo, gold)
        expected_distance_band = edit_distance_band(distance)
        expected_length_band = gold_length_band(len(gold))
        primary_scope = case.get("activeExamTarget")
        expected_key = (
            f"distance={expected_distance_band}|length={expected_length_band}|scope={primary_scope}"
        )
        expected_stratum = {
            "key": expected_key,
            "editDistance": distance,
            "editDistanceBand": expected_distance_band,
            "goldLength": len(gold),
            "goldLengthBand": expected_length_band,
            "primaryScope": primary_scope,
        }
        if stratum != expected_stratum:
            errors.append(f"{label}.stratum mismatch")
        if primary_scope not in SCOPE_ORDER:
            errors.append(f"{label}.activeExamTarget is invalid: {primary_scope!r}")
        direct_scopes = case.get("directExamScopes")
        if not isinstance(direct_scopes, list) or primary_scope not in direct_scopes:
            errors.append(f"{label}.directExamScopes does not contain activeExamTarget")
        elif next(scope for scope in SCOPE_ORDER if scope in direct_scopes) != primary_scope:
            errors.append(f"{label}.activeExamTarget is not the earliest direct scope")

        row = observed_strata.setdefault(
            expected_key,
            {"total": 0, "calibration": 0, "held-out": 0},
        )
        row["total"] += 1
        if split in {"calibration", "held-out"}:
            row[split] += 1

    for typo, typo_splits in splits_by_typo.items():
        if len(typo_splits) != 1:
            errors.append(f"typo collision group crosses splits: {typo} -> {sorted(typo_splits)}")

    for index, case in enumerate(cases):
        if not isinstance(case, dict) or not isinstance(case.get("typo"), str):
            continue
        typo = case["typo"]
        expected_golds = sorted(golds_by_typo[typo])
        if case.get("acceptableGolds") != expected_golds:
            errors.append(f"cases[{index}].acceptableGolds mismatch")
        if case.get("collisionGroupSize") != len(expected_golds):
            errors.append(f"cases[{index}].collisionGroupSize mismatch")

    if len(golds_by_typo) != EXPECTED_UNIQUE_TYPO_COUNT:
        errors.append(
            f"unique typo count must be {EXPECTED_UNIQUE_TYPO_COUNT}, got {len(golds_by_typo)}"
        )
    collision_groups = sum(len(golds) > 1 for golds in golds_by_typo.values())
    collision_pairs = sum(len(golds) for golds in golds_by_typo.values() if len(golds) > 1)
    if collision_groups != EXPECTED_COLLISION_GROUP_COUNT:
        errors.append(
            f"collision group count must be {EXPECTED_COLLISION_GROUP_COUNT}, got {collision_groups}"
        )
    if collision_pairs != EXPECTED_COLLISION_PAIR_COUNT:
        errors.append(
            f"collision pair count must be {EXPECTED_COLLISION_PAIR_COUNT}, got {collision_pairs}"
        )
    if split_counts["calibration"] != EXPECTED_CALIBRATION_COUNT:
        errors.append(
            f"calibration count must be {EXPECTED_CALIBRATION_COUNT}, got {split_counts['calibration']}"
        )
    if split_counts["held-out"] != EXPECTED_HELD_OUT_COUNT:
        errors.append(
            f"held-out count must be {EXPECTED_HELD_OUT_COUNT}, got {split_counts['held-out']}"
        )

    actual_pair_hash = sha256_bytes(serialize_pairs(pairs))
    if actual_pair_hash != EXPECTED_PAIR_SET_SHA256:
        errors.append(
            f"case pair hash must be {EXPECTED_PAIR_SET_SHA256}, got {actual_pair_hash}"
        )
    pair_set = document.get("pairSet")
    if not isinstance(pair_set, dict):
        errors.append("pairSet must be an object")
    else:
        expected_pair_set = {
            "count": EXPECTED_PAIR_COUNT,
            "uniqueTypoCount": EXPECTED_UNIQUE_TYPO_COUNT,
            "collisionGroupCount": EXPECTED_COLLISION_GROUP_COUNT,
            "collisionPairCount": EXPECTED_COLLISION_PAIR_COUNT,
            "serialization": PAIR_SERIALIZATION,
            "sha256": EXPECTED_PAIR_SET_SHA256,
        }
        for key, expected in expected_pair_set.items():
            if pair_set.get(key) != expected:
                errors.append(f"pairSet.{key} must be {expected!r}")

    split_metadata = document.get("split")
    if not isinstance(split_metadata, dict):
        errors.append("split must be an object")
    else:
        expected_split = {
            "seed": SPLIT_SEED,
            "algorithm": SPLIT_ALGORITHM,
            "calibrationCount": EXPECTED_CALIBRATION_COUNT,
            "heldOutCount": EXPECTED_HELD_OUT_COUNT,
        }
        for key, expected in expected_split.items():
            if split_metadata.get(key) != expected:
                errors.append(f"split.{key} must be {expected!r}")

    expected_stratum_summary = dict(sorted(observed_strata.items()))
    if document.get("stratumSummary") != expected_stratum_summary:
        errors.append("stratumSummary does not match cases")

    if errors:
        preview = "\n".join(f"- {error}" for error in errors[:30])
        suffix = f"\n- ... and {len(errors) - 30} more" if len(errors) > 30 else ""
        raise BenchmarkError(f"Manifest verification failed:\n{preview}{suffix}")


def prepare_manifest(dataset_root: Path, wordbook_path: Path, manifest_path: Path) -> dict[str, Any]:
    document = build_manifest_document(
        dataset_root=dataset_root,
        wordbook_path=wordbook_path,
    )
    write_json(manifest_path, document)
    return document


def verify_manifest_against_sources(
    dataset_root: Path,
    wordbook_path: Path,
    manifest_path: Path,
) -> dict[str, Any]:
    checked_in = load_json(manifest_path)
    verify_manifest_document(checked_in)
    rebuilt = build_manifest_document(
        dataset_root=dataset_root,
        wordbook_path=wordbook_path,
    )
    if checked_in != rebuilt:
        raise BenchmarkError(
            "Checked-in manifest differs from a fresh rebuild using the pinned source and wordbook"
        )
    return checked_in


def ratio(numerator: int, denominator: int) -> float:
    return numerator / denominator if denominator else 0.0


def token_f1(actual: Sequence[str], expected: Sequence[str]) -> float:
    actual_counts = Counter(actual)
    expected_counts = Counter(expected)
    overlap = sum((actual_counts & expected_counts).values())
    if not actual and not expected:
        return 1.0
    if not actual or not expected or overlap == 0:
        return 0.0
    precision = overlap / len(actual)
    recall = overlap / len(expected)
    return 2 * precision * recall / (precision + recall)


def percentile_nearest_rank(values: Sequence[float], percentile: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    rank = max(1, math.ceil(percentile * len(ordered)))
    return ordered[rank - 1]


def latency_summary(values: Sequence[float | None]) -> dict[str, int | float | None]:
    present = [float(value) for value in values if value is not None]
    if not present:
        return {"count": 0, "mean": None, "p50": None, "p95": None, "max": None}
    return {
        "count": len(present),
        "mean": round(sum(present) / len(present), 3),
        "p50": round(float(percentile_nearest_rank(present, 0.50)), 3),
        "p95": round(float(percentile_nearest_rank(present, 0.95)), 3),
        "max": round(max(present), 3),
    }


def extract_lemmas(items: Any) -> list[str]:
    if not isinstance(items, list):
        return []
    result: list[str] = []
    for item in items:
        if isinstance(item, dict) and isinstance(item.get("lemma"), str):
            lemma = item["lemma"].strip().lower()
            if lemma and lemma not in result:
                result.append(lemma)
    return result


def acceptable_golds_for_record(record: dict[str, Any]) -> tuple[str, ...]:
    raw = record.get("acceptableGolds")
    if isinstance(raw, list):
        normalized = tuple(
            value.strip().lower()
            for value in raw
            if isinstance(value, str) and value.strip()
        )
        if normalized:
            return normalized
    gold = record.get("gold")
    if isinstance(gold, str) and gold.strip():
        return (gold.strip().lower(),)
    return ()


def first_acceptable_rank(
    candidate_lemmas: Sequence[str],
    acceptable_golds: Sequence[str],
) -> int | None:
    accepted = {lemma.strip().lower() for lemma in acceptable_golds if lemma.strip()}
    return next(
        (
            rank
            for rank, lemma in enumerate(candidate_lemmas, start=1)
            if lemma.strip().lower() in accepted
        ),
        None,
    )


def aggregate_quality(records: Sequence[dict[str, Any]]) -> dict[str, Any]:
    total = len(records)
    route_correct = sum(bool(record.get("route", {}).get("correct")) for record in records)
    slot_exact = sum(bool(record.get("slot", {}).get("exact")) for record in records)
    slot_f1_values = [float(record.get("slot", {}).get("tokenF1", 0.0)) for record in records]
    ranks = [record.get("candidate", {}).get("goldRank") for record in records]
    recall_at = {
        str(k): ratio(sum(isinstance(rank, int) and rank <= k for rank in ranks), total)
        for k in (1, 3, 5)
    }
    reciprocal_ranks = [1 / rank if isinstance(rank, int) and rank > 0 else 0.0 for rank in ranks]
    selected_gold = sum(
        bool(
            set(acceptable_golds_for_record(record))
            & {
                lemma.strip().lower()
                for lemma in record.get("outcome", {}).get("selectedLemmas", [])
                if isinstance(lemma, str)
            }
        )
        for record in records
    )
    provider_called = sum(bool(record.get("outcome", {}).get("providerCalled")) for record in records)
    errors = sum(bool(record.get("error")) for record in records)
    return {
        "totalCases": total,
        "routeAccuracy": ratio(route_correct, total),
        "slotExactAccuracy": ratio(slot_exact, total),
        "slotTokenF1": sum(slot_f1_values) / total if total else 0.0,
        "candidateRecallAtK": recall_at,
        "candidateMRR": sum(reciprocal_ranks) / total if total else 0.0,
        "finalGoldSelectionRate": ratio(selected_gold, total),
        "providerCalledCount": provider_called,
        "errorCount": errors,
    }


def summarize_baseline_records(
    records: Sequence[dict[str, Any]],
    *,
    environment: dict[str, Any],
    selected_split: str,
    run_duration_ms: float,
) -> dict[str, Any]:
    by_split = {
        split: aggregate_quality([record for record in records if record.get("split") == split])
        for split in ("calibration", "held-out")
        if any(record.get("split") == split for record in records)
    }
    stratum_keys = sorted({record.get("stratumKey") for record in records if record.get("stratumKey")})
    by_stratum = {
        stratum_key: aggregate_quality(
            [record for record in records if record.get("stratumKey") == stratum_key]
        )
        for stratum_key in stratum_keys
    }
    return {
        "schemaVersion": "spelling-recovery-benchmark-metrics-v1",
        "benchmarkId": "enggo-spelling-recovery-v1",
        "runMode": "baseline",
        "selectedSplit": selected_split,
        "environment": environment,
        "quality": aggregate_quality(records),
        "outcomes": {
            "resolutionCounts": dict(
                sorted(Counter(record.get("outcome", {}).get("resolution") or "missing" for record in records).items())
            ),
            "noMatchReasonCounts": dict(
                sorted(
                    Counter(
                        record.get("outcome", {}).get("noMatchReason") or "none"
                        for record in records
                    ).items()
                )
            ),
            "statusCounts": dict(
                sorted(Counter(str(record.get("outcome", {}).get("statusCode")) for record in records).items())
            ),
            "candidateGenerationCallCount": sum(
                record.get("candidate", {}).get("generationLatencyMs") is not None
                for record in records
            ),
        },
        "latencyMs": {
            "route": latency_summary([record.get("latencyMs", {}).get("route") for record in records]),
            "candidateGeneration": latency_summary(
                [record.get("candidate", {}).get("generationLatencyMs") for record in records]
            ),
            "toolExecution": latency_summary(
                [record.get("latencyMs", {}).get("toolExecution") for record in records]
            ),
            "total": latency_summary([record.get("latencyMs", {}).get("total") for record in records]),
            "runDuration": round(run_duration_ms, 3),
        },
        "bySplit": by_split,
        "byStratum": by_stratum,
    }


def markdown_summary(metrics: dict[str, Any], artifacts: dict[str, Path]) -> str:
    quality = metrics["quality"]
    latency = metrics["latencyMs"]
    outcomes = metrics["outcomes"]
    environment = metrics["environment"]
    recall = quality["candidateRecallAtK"]

    def percentage(value: float) -> str:
        return f"{value * 100:.2f}%"

    lines = [
        "# Spelling Recovery V1 Provider-off Baseline",
        "",
        f"- 生成时间：`{environment['generatedAtUtc']}`",
        f"- Git HEAD：`{environment['gitHead']}`（dirty=`{str(environment['gitDirty']).lower()}`）",
        f"- 运行模式：`provider=None`、`NullStructuredLookupRepository`、structured runtime off",
        f"- 数据：TOEFL-Spell `{environment['toeflSpellCommit']}` / `{environment['toeflSpellSha256']}`",
        f"- split：`{metrics['selectedSplit']}`，共 `{quality['totalCases']}` pair cases",
        "",
        "## 主指标",
        "",
        "| 指标 | 结果 |",
        "| --- | ---: |",
        f"| Route accuracy | {percentage(quality['routeAccuracy'])} |",
        f"| Slot exact accuracy | {percentage(quality['slotExactAccuracy'])} |",
        f"| Slot token F1 | {quality['slotTokenF1']:.4f} |",
        f"| Candidate Recall@1 | {percentage(recall['1'])} |",
        f"| Candidate Recall@3 | {percentage(recall['3'])} |",
        f"| Candidate Recall@5 | {percentage(recall['5'])} |",
        f"| Candidate MRR | {quality['candidateMRR']:.4f} |",
        f"| Final gold selection rate | {percentage(quality['finalGoldSelectionRate'])} |",
        f"| Provider called | {quality['providerCalledCount']} |",
        f"| Runner errors | {quality['errorCount']} |",
        "",
        "## 延迟",
        "",
        "| 阶段 | count | p50 ms | p95 ms | max ms |",
        "| --- | ---: | ---: | ---: | ---: |",
    ]
    for key, label in (
        ("route", "Route plan"),
        ("candidateGeneration", "Null candidate call"),
        ("toolExecution", "Tool execution"),
        ("total", "Total per case"),
    ):
        row = latency[key]
        lines.append(
            f"| {label} | {row['count']} | {row['p50']} | {row['p95']} | {row['max']} |"
        )

    lines.extend(
        [
            "",
            "## Outcome 分布",
            "",
            f"- resolution：`{json.dumps(outcomes['resolutionCounts'], ensure_ascii=False, sort_keys=True)}`",
            f"- noMatchReason：`{json.dumps(outcomes['noMatchReasonCounts'], ensure_ascii=False, sort_keys=True)}`",
            f"- candidate generation calls：`{outcomes['candidateGenerationCallCount']}`",
            "",
            "## 产物",
            "",
            f"- Case JSONL：`{artifacts['jsonl']}`",
            f"- Metrics JSON：`{artifacts['metrics']}`",
            f"- 本摘要：`{artifacts['markdown']}`",
            "",
            "说明：candidate 指标只读取 Null repository 的 typo candidate 通道；ECDICT exact fallback 即使最终 resolved，也不会冒充 candidate recall。runner 不调用 `load_settings()` 或 `load_dotenv()`，provider 环境变量只记录是否存在，不读取其值。",
            "",
        ]
    )
    return "\n".join(lines)


def baseline_environment(
    *,
    manifest_path: Path,
    wordbook_path: Path,
    ecdict_path: Path,
    dataset_root: Path,
) -> dict[str, Any]:
    annotations_path = dataset_root / UPSTREAM_INPUT
    return {
        "generatedAtUtc": utc_now_iso(),
        "pythonExecutable": sys.executable,
        "pythonVersion": platform.python_version(),
        "platform": platform.platform(),
        "repoRoot": str(REPO_ROOT),
        "gitHead": git_head(REPO_ROOT),
        "gitDirty": repo_is_dirty(REPO_ROOT),
        "manifestPath": str(manifest_path.resolve()),
        "manifestSha256": json_file_sha256(manifest_path),
        "wordbookPath": str(wordbook_path.resolve()),
        "wordbookSha256": sha256_file(wordbook_path),
        "ecdictPath": str(ecdict_path.resolve()),
        "ecdictSha256": sha256_file(ecdict_path),
        "ecdictBytes": ecdict_path.stat().st_size,
        "toeflSpellRoot": str(dataset_root.resolve()),
        "toeflSpellCommit": git_head(dataset_root),
        "toeflSpellSha256": sha256_file(annotations_path),
        "structuredRuntime": False,
        "repository": "RecordingNullStructuredLookupRepository(NullStructuredLookupRepository)",
        "providerMode": "off",
        "providerConfigured": False,
        "providerEnvironmentKeysPresent": {
            key: bool(os.environ.get(key)) for key in PROVIDER_ENV_KEYS
        },
        "dotenvLoadedByRunner": False,
    }


def process_rss_bytes() -> int | None:
    """Return current RSS without adding a benchmark-only dependency."""

    if sys.platform == "win32":
        try:
            import ctypes
            from ctypes import wintypes

            class ProcessMemoryCounters(ctypes.Structure):
                _fields_ = [
                    ("cb", wintypes.DWORD),
                    ("PageFaultCount", wintypes.DWORD),
                    ("PeakWorkingSetSize", ctypes.c_size_t),
                    ("WorkingSetSize", ctypes.c_size_t),
                    ("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
                    ("QuotaPagedPoolUsage", ctypes.c_size_t),
                    ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
                    ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                    ("PagefileUsage", ctypes.c_size_t),
                    ("PeakPagefileUsage", ctypes.c_size_t),
                ]

            counters = ProcessMemoryCounters()
            counters.cb = ctypes.sizeof(counters)
            kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
            psapi = ctypes.WinDLL("psapi", use_last_error=True)
            kernel32.GetCurrentProcess.restype = wintypes.HANDLE
            psapi.GetProcessMemoryInfo.argtypes = [
                wintypes.HANDLE,
                ctypes.POINTER(ProcessMemoryCounters),
                wintypes.DWORD,
            ]
            psapi.GetProcessMemoryInfo.restype = wintypes.BOOL
            handle = kernel32.GetCurrentProcess()
            ok = psapi.GetProcessMemoryInfo(
                handle,
                ctypes.byref(counters),
                counters.cb,
            )
            return int(counters.WorkingSetSize) if ok else None
        except (AttributeError, OSError, ValueError):
            return None

    statm = Path("/proc/self/statm")
    try:
        pages = int(statm.read_text(encoding="ascii").split()[1])
        return pages * int(os.sysconf("SC_PAGE_SIZE"))
    except (OSError, ValueError, IndexError, AttributeError):
        return None


def load_quality_fixtures(path: Path) -> dict[str, Any]:
    document = load_json(path)
    if not isinstance(document, dict):
        raise BenchmarkError("Quality fixture root must be an object")
    if document.get("schemaVersion") != QUALITY_FIXTURES_SCHEMA_VERSION:
        raise BenchmarkError(
            f"Quality fixture schemaVersion must be {QUALITY_FIXTURES_SCHEMA_VERSION}",
        )
    ecdict_hash = document.get("ecdictSha256")
    if not isinstance(ecdict_hash, str) or not re.fullmatch(r"[0-9a-f]{64}", ecdict_hash):
        raise BenchmarkError("Quality fixture ecdictSha256 must be a lowercase SHA-256")
    if not isinstance(document.get("neighborDensityDefinition"), dict):
        raise BenchmarkError("Quality fixture neighborDensityDefinition must be an object")

    sections = {
        "validWords": {"required": ("term", "activeExamTarget", "stratum")},
        "ambiguousTypos": {
            "required": ("term", "activeExamTarget", "acceptableGolds", "expectedDecision")
        },
        "randomStrings": {"required": ("term", "activeExamTarget", "expectedDecision")},
        "routeSlotCases": {
            "required": (
                "query",
                "activeExamTarget",
                "expectedQueryMode",
                "expectedTool",
                "expectedEnglishTerms",
            )
        },
    }
    seen_ids: set[str] = set()
    for section_name, contract in sections.items():
        rows = document.get(section_name)
        if not isinstance(rows, list) or not rows:
            raise BenchmarkError(f"Quality fixture {section_name} must be a non-empty array")
        for index, row in enumerate(rows):
            if not isinstance(row, dict):
                raise BenchmarkError(f"{section_name}[{index}] must be an object")
            fixture_id = row.get("id")
            if not isinstance(fixture_id, str) or not fixture_id or fixture_id in seen_ids:
                raise BenchmarkError(f"{section_name}[{index}].id must be unique")
            seen_ids.add(fixture_id)
            missing = [key for key in contract["required"] if key not in row]
            if missing:
                raise BenchmarkError(f"{section_name}[{index}] missing {missing}")
            target = row.get("activeExamTarget")
            if target not in SCOPE_ORDER:
                raise BenchmarkError(
                    f"{section_name}[{index}].activeExamTarget is invalid: {target!r}",
                )
            term = row.get("term")
            if section_name != "routeSlotCases" and (
                not isinstance(term, str) or not TOKEN_PATTERN.fullmatch(term)
            ):
                raise BenchmarkError(f"{section_name}[{index}].term is invalid")
    return document


def serialize_spelling_candidate(candidate: Any, *, rank: int) -> dict[str, Any]:
    rank_key = getattr(candidate, "rank_key", ())
    return {
        "rank": rank,
        "lemma": getattr(candidate, "lemma", None),
        "editDistance": getattr(candidate, "edit_distance", None),
        "inActiveExamScope": bool(getattr(candidate, "in_active_exam_scope", False)),
        "scopeCodes": list(getattr(candidate, "scope_codes", ())),
        "sourceKind": getattr(candidate, "source_kind", None),
        "reasonCodes": list(getattr(candidate, "reason_codes", ())),
        "rankKey": list(rank_key) if isinstance(rank_key, (tuple, list)) else [],
    }


def candidate_scope_outcome(
    serialized_candidates: Sequence[dict[str, Any]],
    acceptable_golds: Sequence[str],
) -> str:
    accepted = {value.strip().lower() for value in acceptable_golds}
    for candidate in serialized_candidates:
        lemma = candidate.get("lemma")
        if isinstance(lemma, str) and lemma.lower() in accepted:
            return (
                "active_scope"
                if candidate.get("inActiveExamScope") is True
                else "global_fallback"
            )
    return "unrecalled"


def aggregate_current_quality(records: Sequence[dict[str, Any]]) -> dict[str, Any]:
    base = aggregate_quality(records)
    decisions = [record.get("decision", {}) for record in records]
    auto_rows = [
        record
        for record in records
        if record.get("decision", {}).get("kind") == "auto_correct"
    ]
    auto_correct = sum(
        bool(record.get("decision", {}).get("correct")) for record in auto_rows
    )
    total = len(records)
    base.update(
        {
            "autoCorrectionCount": len(auto_rows),
            "autoCorrectionCorrectCount": auto_correct,
            "autoCorrectionPrecision": (
                ratio(auto_correct, len(auto_rows)) if auto_rows else None
            ),
            "autoCorrectionCoverage": ratio(len(auto_rows), total),
            "clarificationRate": ratio(
                sum(decision.get("kind") == "clarify_candidates" for decision in decisions),
                total,
            ),
            "safeNoMatchRate": ratio(
                sum(
                    decision.get("kind") == "no_reliable_candidate"
                    for decision in decisions
                ),
                total,
            ),
            "decisionCounts": dict(
                sorted(Counter(decision.get("kind") or "missing" for decision in decisions).items())
            ),
            "decisionReasonCounts": dict(
                sorted(
                    Counter(
                        decision.get("reasonCode") or "missing" for decision in decisions
                    ).items()
                )
            ),
        }
    )
    return base


def _grouped_current_quality(
    records: Sequence[dict[str, Any]],
    key,
) -> dict[str, Any]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        value = key(record)
        grouped[str(value if value is not None else "missing")].append(record)
    return {
        group_key: aggregate_current_quality(grouped[group_key])
        for group_key in sorted(grouped)
    }


def summarize_current_records(
    typo_records: Sequence[dict[str, Any]],
    fixture_records: Sequence[dict[str, Any]],
    route_slot_records: Sequence[dict[str, Any]],
    *,
    environment: dict[str, Any],
    selected_split: str,
    run_duration_ms: float,
    cold_load: dict[str, Any],
) -> dict[str, Any]:
    valid_records = [row for row in fixture_records if row.get("caseType") == "valid_word"]
    ambiguous_records = [
        row for row in fixture_records if row.get("caseType") == "ambiguous_typo"
    ]
    random_records = [row for row in fixture_records if row.get("caseType") == "random_string"]
    valid_false = sum(row.get("decision", {}).get("kind") == "auto_correct" for row in valid_records)
    random_auto = sum(row.get("decision", {}).get("kind") == "auto_correct" for row in random_records)
    valid_protected = sum(
        row.get("candidate", {}).get("inputIsKnownWord") is True
        and row.get("decision", {}).get("kind") == row.get("expectedDecision")
        for row in valid_records
    )
    random_protected = sum(
        row.get("candidate", {}).get("inputIsKnownWord") is False
        and row.get("decision", {}).get("kind") == row.get("expectedDecision")
        for row in random_records
    )
    ambiguous_ok = sum(
        row.get("decision", {}).get("kind") == row.get("expectedDecision")
        for row in ambiguous_records
    )
    route_correct = sum(row.get("route", {}).get("correct") is True for row in route_slot_records)
    slot_exact = sum(row.get("slot", {}).get("exact") is True for row in route_slot_records)
    slot_f1 = [float(row.get("slot", {}).get("tokenF1", 0.0)) for row in route_slot_records]
    quality = aggregate_current_quality(typo_records)

    resolution_no_match: dict[str, Counter[str]] = defaultdict(Counter)
    for record in typo_records:
        outcome = record.get("outcome", {})
        resolution = outcome.get("resolution") or "missing"
        reason = outcome.get("noMatchReason") or "none"
        resolution_no_match[resolution][reason] += 1

    candidate_p95 = latency_summary(
        [record.get("candidate", {}).get("generationLatencyMs") for record in typo_records]
    )["p95"]
    rss_delta = cold_load.get("candidateIndexRssDeltaBytes")
    full_heldout = (
        selected_split == "held-out"
        and len(typo_records) == EXPECTED_HELD_OUT_COUNT
    )
    full_calibration = (
        selected_split == "calibration"
        and len(typo_records) == EXPECTED_CALIBRATION_COUNT
    )
    complete_selected_split = full_calibration or full_heldout
    fixture_route_accuracy = ratio(route_correct, len(route_slot_records))
    fixture_slot_exact = ratio(slot_exact, len(route_slot_records))
    fixture_slot_f1 = sum(slot_f1) / len(slot_f1) if slot_f1 else 0.0
    auto_precision = quality["autoCorrectionPrecision"]
    auto_precision_passed = auto_precision is None or auto_precision >= 0.98
    gates = {
        "validWordFalseCorrectionRate": {
            "actual": ratio(valid_false, len(valid_records)),
            "threshold": 0.0,
            "evaluated": True,
            "evaluatedOnFinalGate": full_heldout,
            "passed": bool(valid_records) and valid_false == 0,
        },
        "validWordProtectionRate": {
            "actual": ratio(valid_protected, len(valid_records)),
            "threshold": 1.0,
            "evaluated": True,
            "evaluatedOnFinalGate": full_heldout,
            "passed": bool(valid_records) and valid_protected == len(valid_records),
        },
        "randomStringAutoCorrectionRate": {
            "actual": ratio(random_auto, len(random_records)),
            "threshold": 0.0,
            "evaluated": True,
            "evaluatedOnFinalGate": full_heldout,
            "passed": bool(random_records) and random_auto == 0,
        },
        "randomStringProtectionRate": {
            "actual": ratio(random_protected, len(random_records)),
            "threshold": 1.0,
            "evaluated": True,
            "evaluatedOnFinalGate": full_heldout,
            "passed": bool(random_records) and random_protected == len(random_records),
        },
        "ambiguousClarificationRate": {
            "actual": ratio(ambiguous_ok, len(ambiguous_records)),
            "threshold": 1.0,
            "evaluated": True,
            "evaluatedOnFinalGate": full_heldout,
            "passed": bool(ambiguous_records) and ambiguous_ok == len(ambiguous_records),
        },
        "mainSplitRouteAccuracy": {
            "actual": quality["routeAccuracy"],
            "threshold": 1.0,
            "evaluated": True,
            "evaluatedOnFinalGate": full_heldout,
            "passed": bool(typo_records) and quality["routeAccuracy"] == 1.0,
        },
        "mainSplitSlotExactAccuracy": {
            "actual": quality["slotExactAccuracy"],
            "threshold": 1.0,
            "evaluated": True,
            "evaluatedOnFinalGate": full_heldout,
            "passed": bool(typo_records) and quality["slotExactAccuracy"] == 1.0,
        },
        "mainSplitSlotTokenF1": {
            "actual": quality["slotTokenF1"],
            "threshold": 1.0,
            "evaluated": True,
            "evaluatedOnFinalGate": full_heldout,
            "passed": bool(typo_records) and quality["slotTokenF1"] == 1.0,
        },
        "fixedFixtureRouteAccuracy": {
            "actual": fixture_route_accuracy,
            "threshold": 1.0,
            "evaluated": True,
            "evaluatedOnFinalGate": full_heldout,
            "passed": bool(route_slot_records) and fixture_route_accuracy == 1.0,
        },
        "fixedFixtureSlotExactAccuracy": {
            "actual": fixture_slot_exact,
            "threshold": 1.0,
            "evaluated": True,
            "evaluatedOnFinalGate": full_heldout,
            "passed": bool(route_slot_records) and fixture_slot_exact == 1.0,
        },
        "fixedFixtureSlotTokenF1": {
            "actual": fixture_slot_f1,
            "threshold": 1.0,
            "evaluated": True,
            "evaluatedOnFinalGate": full_heldout,
            "passed": bool(route_slot_records) and fixture_slot_f1 == 1.0,
        },
        "autoCorrectionPrecision": {
            "actual": auto_precision,
            "threshold": 0.98,
            "evaluated": True,
            "evaluatedOnFinalGate": full_heldout,
            "passed": auto_precision_passed,
            "zeroAutoCorrectionPolicy": (
                "precision_is_none_but_passes_because_auto_coverage_has_no_minimum"
                if auto_precision is None
                else None
            ),
        },
        "candidateRecallAt3": {
            "actual": quality["candidateRecallAtK"]["3"],
            "threshold": 0.85,
            "evaluated": True,
            "evaluatedOnFinalGate": full_heldout,
            "passed": quality["candidateRecallAtK"]["3"] >= 0.85,
        },
        "warmCandidateP95Ms": {
            "actual": candidate_p95,
            "threshold": 150.0,
            "evaluated": True,
            "evaluatedOnFinalGate": full_heldout,
            "passed": candidate_p95 is not None and candidate_p95 <= 150.0,
        },
        "candidateIndexRssDeltaBytes": {
            "actual": rss_delta,
            "threshold": 100 * 1024 * 1024,
            "evaluated": True,
            "evaluatedOnFinalGate": full_heldout,
            "passed": rss_delta is not None and rss_delta <= 100 * 1024 * 1024,
        },
        "providerCalledCount": {
            "actual": quality["providerCalledCount"],
            "threshold": 0,
            "evaluated": True,
            "evaluatedOnFinalGate": full_heldout,
            "passed": quality["providerCalledCount"] == 0,
        },
        "runnerErrorCount": {
            "actual": quality["errorCount"],
            "threshold": 0,
            "evaluated": True,
            "evaluatedOnFinalGate": full_heldout,
            "passed": quality["errorCount"] == 0,
        },
        "selectedSplitCaseCount": {
            "actual": len(typo_records),
            "threshold": (
                EXPECTED_CALIBRATION_COUNT
                if selected_split == "calibration"
                else EXPECTED_HELD_OUT_COUNT
            ),
            "evaluated": True,
            "evaluatedOnFinalGate": full_heldout,
            "passed": complete_selected_split,
        },
    }
    evaluated_gates = [gate for gate in gates.values() if gate.get("evaluated") is True]
    all_passed = complete_selected_split and bool(evaluated_gates) and all(
        gate.get("passed") is True for gate in evaluated_gates
    )
    readiness_passed = all_passed if full_calibration else None
    final_gate_passed = all_passed if full_heldout else None
    return {
        "schemaVersion": "spelling-recovery-benchmark-metrics-v2",
        "benchmarkId": "enggo-spelling-recovery-v1",
        "runMode": "current",
        "selectedSplit": selected_split,
        "environment": environment,
        "quality": quality,
        "negativeAndContractSamples": {
            "validWord": {
                "total": len(valid_records),
                "falseCorrectionCount": valid_false,
                "falseCorrectionRate": ratio(valid_false, len(valid_records)),
                "protectedCount": valid_protected,
                "protectionRate": ratio(valid_protected, len(valid_records)),
                "byExamTarget": dict(
                    sorted(Counter(row.get("activeExamTarget") for row in valid_records).items())
                ),
                "byLengthBand": dict(
                    sorted(Counter(row.get("stratum", {}).get("lengthBand") for row in valid_records).items())
                ),
                "byNeighborDensityBand": dict(
                    sorted(Counter(row.get("stratum", {}).get("neighborDensityBand") for row in valid_records).items())
                ),
            },
            "ambiguous": {
                "total": len(ambiguous_records),
                "expectedDecisionCount": ambiguous_ok,
                "clarificationRate": ratio(ambiguous_ok, len(ambiguous_records)),
            },
            "randomString": {
                "total": len(random_records),
                "autoCorrectionCount": random_auto,
                "autoCorrectionRate": ratio(random_auto, len(random_records)),
                "protectedCount": random_protected,
                "protectionRate": ratio(random_protected, len(random_records)),
            },
            "routeSlot": {
                "total": len(route_slot_records),
                "routeAccuracy": ratio(route_correct, len(route_slot_records)),
                "slotExactAccuracy": ratio(slot_exact, len(route_slot_records)),
                "slotTokenF1": sum(slot_f1) / len(slot_f1) if slot_f1 else 0.0,
            },
        },
        "outcomes": {
            "resolutionCounts": dict(
                sorted(Counter(row.get("outcome", {}).get("resolution") or "missing" for row in typo_records).items())
            ),
            "noMatchReasonCounts": dict(
                sorted(Counter(row.get("outcome", {}).get("noMatchReason") or "none" for row in typo_records).items())
            ),
            "resolutionNoMatchMatrix": {
                resolution: dict(sorted(reason_counts.items()))
                for resolution, reason_counts in sorted(resolution_no_match.items())
            },
            "recoveryRate": ratio(
                sum(row.get("outcome", {}).get("recoveryKind") not in {None, "none"} for row in typo_records),
                len(typo_records),
            ),
            "providerOutcomeCounts": dict(
                sorted(Counter(row.get("outcome", {}).get("providerOutcome") or "missing" for row in typo_records).items())
            ),
        },
        "latencyMs": {
            "route": latency_summary([row.get("latencyMs", {}).get("route") for row in typo_records]),
            "candidateGeneration": latency_summary([row.get("candidate", {}).get("generationLatencyMs") for row in typo_records]),
            "decision": latency_summary([row.get("decision", {}).get("latencyMs") for row in typo_records]),
            "toolExecution": latency_summary([row.get("latencyMs", {}).get("toolExecution") for row in typo_records]),
            "total": latency_summary([row.get("latencyMs", {}).get("total") for row in typo_records]),
            "coldLoad": cold_load,
            "runDuration": round(run_duration_ms, 3),
        },
        "byExamTarget": _grouped_current_quality(typo_records, lambda row: row.get("activeExamTarget")),
        "byScopeOutcome": _grouped_current_quality(typo_records, lambda row: row.get("candidate", {}).get("scopeOutcome")),
        "byGoldLengthBand": _grouped_current_quality(typo_records, lambda row: row.get("stratum", {}).get("goldLengthBand")),
        "byEditDistanceBand": _grouped_current_quality(typo_records, lambda row: row.get("stratum", {}).get("editDistanceBand")),
        "byStratum": _grouped_current_quality(typo_records, lambda row: row.get("stratumKey")),
        "gates": gates,
        "gateSummary": {
            "allPassed": all_passed,
            "readinessPassed": readiness_passed,
            "finalGatePassed": final_gate_passed,
            "fullCalibrationSplit": full_calibration,
            "fullHeldOutSplit": full_heldout,
            "evaluatedGateCount": len(evaluated_gates),
            "totalGateCount": len(gates),
        },
    }


def current_markdown_summary(metrics: dict[str, Any], artifacts: dict[str, Path]) -> str:
    quality = metrics["quality"]
    recall = quality["candidateRecallAtK"]
    samples = metrics["negativeAndContractSamples"]
    latency = metrics["latencyMs"]

    def percentage(value: float | None) -> str:
        return "n/a" if value is None else f"{value * 100:.2f}%"

    lines = [
        "# Spelling Recovery V1 Current Provider-off Benchmark",
        "",
        f"- 生成时间：`{metrics['environment']['generatedAtUtc']}`",
        f"- split：`{metrics['selectedSplit']}`，共 `{quality['totalCases']}` pair cases",
        "- provider：`off`；structured runtime：`off`；候选与 decision 均为本地确定性路径",
        "- collision 计分：任一 `acceptableGolds` 命中即视为该 typo group 命中",
        "",
        "## 主指标",
        "",
        "| 指标 | 结果 |",
        "| --- | ---: |",
        f"| Route accuracy | {percentage(quality['routeAccuracy'])} |",
        f"| Slot exact accuracy | {percentage(quality['slotExactAccuracy'])} |",
        f"| Candidate Recall@1 | {percentage(recall['1'])} |",
        f"| Candidate Recall@3 | {percentage(recall['3'])} |",
        f"| Candidate Recall@5 | {percentage(recall['5'])} |",
        f"| Candidate MRR | {quality['candidateMRR']:.4f} |",
        f"| Auto-correct precision | {percentage(quality['autoCorrectionPrecision'])} |",
        f"| Auto-correct coverage | {percentage(quality['autoCorrectionCoverage'])} |",
        f"| Clarification rate | {percentage(quality['clarificationRate'])} |",
        f"| Safe no-match rate | {percentage(quality['safeNoMatchRate'])} |",
        "",
        "## 固定负样本 / 合同样本",
        "",
        f"- valid-word false correction：`{samples['validWord']['falseCorrectionCount']}/{samples['validWord']['total']}`",
        f"- valid-word known + expected decision：`{samples['validWord']['protectedCount']}/{samples['validWord']['total']}`",
        f"- random-string auto correction：`{samples['randomString']['autoCorrectionCount']}/{samples['randomString']['total']}`",
        f"- random-string unknown + expected decision：`{samples['randomString']['protectedCount']}/{samples['randomString']['total']}`",
        f"- ambiguous clarification：`{samples['ambiguous']['expectedDecisionCount']}/{samples['ambiguous']['total']}`",
        f"- route / slot：route `{percentage(samples['routeSlot']['routeAccuracy'])}`，slot exact `{percentage(samples['routeSlot']['slotExactAccuracy'])}`，slot F1 `{samples['routeSlot']['slotTokenF1']:.4f}`",
        "",
        "## 性能",
        "",
        f"- ECDICT cold load：`{latency['coldLoad']['ecdictColdLoadMs']} ms`",
        f"- candidate provider cold prepare：`{latency['coldLoad']['candidateColdLoadMs']} ms`",
        f"- warm candidate p50 / p95：`{latency['candidateGeneration']['p50']} / {latency['candidateGeneration']['p95']} ms`",
        f"- candidate index RSS delta：`{latency['coldLoad']['candidateIndexRssDeltaBytes']}` bytes",
        "",
        "## Gate 状态",
        "",
        f"- allPassed：`{metrics['gateSummary']['allPassed']}`",
        f"- readinessPassed：`{metrics['gateSummary']['readinessPassed']}`",
        f"- finalGatePassed：`{metrics['gateSummary']['finalGatePassed']}`",
        "- `autoCorrectionPrecision=None` 只在 auto coverage 为 0 时按通过处理，因为本设计明确不设 auto coverage 最低门槛。",
        "",
    ]
    for gate_name, gate in metrics["gates"].items():
        final_note = "（完整 held-out 最终门）" if gate.get("evaluatedOnFinalGate") else ""
        lines.append(
            f"- `{gate_name}`：evaluated=`{str(gate.get('evaluated')).lower()}`，actual=`{gate.get('actual')}`，threshold=`{gate.get('threshold')}`，passed=`{str(gate.get('passed')).lower()}`{final_note}"
        )
    lines.extend(
        [
            "",
            "## 产物",
            "",
            f"- Case JSONL：`{artifacts['jsonl']}`",
            f"- Metrics JSON：`{artifacts['metrics']}`",
            f"- 本摘要：`{artifacts['markdown']}`",
            "",
            "说明：provider-on 成文 / recovery smoke 必须另行报告，不能计入本报告的 candidate Recall 或 auto-correct precision。",
            "",
        ]
    )
    return "\n".join(lines)


def decision_resolution(kind: str) -> str:
    return {
        "auto_correct": "resolved",
        "clarify_candidates": "needs_clarification",
        "no_reliable_candidate": "no_match",
    }.get(kind, "missing")


POLICY_REPLAY_SCHEMA_VERSION = "spelling-recovery-policy-replay-v1"
POLICY_REPLAY_FIXTURE_COUNTS = {
    "valid_word": 12,
    "ambiguous_typo": 3,
    "random_string": 4,
    "route_slot": 4,
}
POLICY_REPLAY_INHERITED_GATE_NAMES = (
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


def replay_policy_artifact_paths(output_dir: Path) -> dict[str, Path]:
    return {
        "json": output_dir / "calibration-policy-replay.json",
        "markdown": output_dir / "calibration-policy-replay.md",
    }


def validate_replay_output_dir(output_dir: Path) -> None:
    resolved = output_dir.resolve()
    current_root = DEFAULT_CURRENT_OUTPUT_ROOT.resolve()
    try:
        resolved.relative_to(current_root)
    except ValueError:
        return
    raise BenchmarkError(
        "Policy replay output must stay outside current benchmark calibration and held-out directories",
    )


def _validate_explicit_sha256(value: str, *, label: str) -> None:
    if not isinstance(value, str) or re.fullmatch(r"[0-9a-f]{64}", value) is None:
        raise BenchmarkError(f"{label} must be an explicit 64-character lowercase SHA-256")


def _reject_heldout_input_path(path: Path) -> None:
    normalized_parts = [part.lower().replace("_", "-") for part in path.parts]
    if any("held-out" in part or "heldout" in part for part in normalized_parts):
        raise BenchmarkError("held-out paths are forbidden for calibration policy replay")


def _read_jsonl_objects(path: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    try:
        handle = path.open("r", encoding="utf-8")
    except OSError as error:
        raise BenchmarkError(f"Cannot read calibration cases JSONL: {path}") from error
    with handle:
        for line_number, raw_line in enumerate(handle, start=1):
            if not raw_line.strip():
                raise BenchmarkError(f"Calibration cases JSONL has a blank line at {line_number}")
            try:
                record = json.loads(raw_line)
            except json.JSONDecodeError as error:
                raise BenchmarkError(
                    f"Invalid calibration cases JSONL at line {line_number}: {error}",
                ) from error
            if not isinstance(record, dict):
                raise BenchmarkError(
                    f"Calibration cases JSONL line {line_number} must be an object",
                )
            records.append(record)
    return records


def validate_policy_replay_artifacts(
    *,
    calibration_cases_path: Path,
    calibration_metrics_path: Path,
    expected_cases_sha256: str,
    expected_metrics_sha256: str,
) -> tuple[list[dict[str, Any]], dict[str, Any], dict[str, str]]:
    """Validate a complete provider-off calibration artifact before replaying policy."""

    _validate_explicit_sha256(expected_cases_sha256, label="cases SHA-256")
    _validate_explicit_sha256(expected_metrics_sha256, label="metrics SHA-256")
    _reject_heldout_input_path(calibration_cases_path)
    _reject_heldout_input_path(calibration_metrics_path)

    try:
        actual_cases_sha256 = sha256_file(calibration_cases_path)
    except OSError as error:
        raise BenchmarkError(
            f"Cannot hash calibration cases JSONL: {calibration_cases_path}",
        ) from error
    if actual_cases_sha256 != expected_cases_sha256:
        raise BenchmarkError(
            "cases SHA-256 mismatch: "
            f"expected {expected_cases_sha256}, got {actual_cases_sha256}",
        )
    try:
        actual_metrics_sha256 = sha256_file(calibration_metrics_path)
    except OSError as error:
        raise BenchmarkError(
            f"Cannot hash calibration metrics JSON: {calibration_metrics_path}",
        ) from error
    if actual_metrics_sha256 != expected_metrics_sha256:
        raise BenchmarkError(
            "metrics SHA-256 mismatch: "
            f"expected {expected_metrics_sha256}, got {actual_metrics_sha256}",
        )

    records = _read_jsonl_objects(calibration_cases_path)
    metrics = load_json(calibration_metrics_path)
    if not isinstance(metrics, dict):
        raise BenchmarkError("Calibration metrics root must be an object")
    if metrics.get("schemaVersion") != "spelling-recovery-benchmark-metrics-v2":
        raise BenchmarkError("Calibration metrics schemaVersion is not current v2")
    if metrics.get("runMode") != "current" or metrics.get("selectedSplit") != "calibration":
        raise BenchmarkError("Policy replay accepts only current calibration metrics")
    environment = metrics.get("environment")
    if not isinstance(environment, dict):
        raise BenchmarkError("Calibration metrics environment is missing")
    if environment.get("providerMode") != "off":
        raise BenchmarkError("Calibration metrics providerMode must be off")
    if environment.get("structuredRuntime") is not False:
        raise BenchmarkError("Calibration metrics structuredRuntime must be false")

    typo_records = [record for record in records if record.get("caseType") == "typo"]
    if len(typo_records) != EXPECTED_CALIBRATION_COUNT:
        raise BenchmarkError(
            "Policy replay requires exactly 481 typo calibration records; "
            f"got {len(typo_records)}",
        )
    expected_indexes = list(range(1, EXPECTED_CALIBRATION_COUNT + 1))
    actual_indexes = [record.get("caseIndex") for record in typo_records]
    if actual_indexes != expected_indexes:
        raise BenchmarkError("Calibration typo caseIndex must be the ordered range 1..481")
    ids = [record.get("id") for record in typo_records]
    if any(not isinstance(case_id, str) or not case_id for case_id in ids):
        raise BenchmarkError("Every calibration typo record must have a non-empty id")
    if len(set(ids)) != EXPECTED_CALIBRATION_COUNT:
        raise BenchmarkError("Calibration typo ids must be unique")
    if any(record.get("split") != "calibration" for record in typo_records):
        raise BenchmarkError("Every typo record must have split=calibration")
    if any(
        record.get("error") is not None and record.get("error") != ""
        for record in records
    ):
        raise BenchmarkError("Calibration artifact contains runner errors")
    if any(
        isinstance(record.get("outcome"), dict)
        and record["outcome"].get("providerCalled") is True
        for record in records
    ):
        raise BenchmarkError("Calibration artifact contains provider calls")

    observed_fixture_counts = Counter(
        record.get("caseType")
        for record in records
        if record.get("caseType") != "typo"
    )
    if dict(observed_fixture_counts) != POLICY_REPLAY_FIXTURE_COUNTS:
        raise BenchmarkError(
            "Calibration fixture counts mismatch: "
            f"expected {POLICY_REPLAY_FIXTURE_COUNTS}, got {dict(observed_fixture_counts)}",
        )

    quality = metrics.get("quality")
    gate_summary = metrics.get("gateSummary")
    if not isinstance(quality, dict) or not isinstance(gate_summary, dict):
        raise BenchmarkError("Calibration metrics quality/gateSummary is missing")
    if quality.get("totalCases") != EXPECTED_CALIBRATION_COUNT:
        raise BenchmarkError("Calibration metrics totalCases must be 481")
    if quality.get("providerCalledCount") != 0:
        raise BenchmarkError("Calibration metrics providerCalledCount must be 0")
    if quality.get("errorCount") != 0:
        raise BenchmarkError("Calibration metrics errorCount must be 0")
    if gate_summary.get("fullCalibrationSplit") is not True:
        raise BenchmarkError("Calibration metrics must certify fullCalibrationSplit=true")

    record_recall_at3 = ratio(
        sum(
            isinstance(record.get("candidate", {}).get("goldRank"), int)
            and record["candidate"]["goldRank"] <= 3
            for record in typo_records
        ),
        len(typo_records),
    )
    metric_recall_at3 = quality.get("candidateRecallAtK", {}).get("3")
    if not isinstance(metric_recall_at3, (int, float)) or not math.isclose(
        record_recall_at3,
        float(metric_recall_at3),
        rel_tol=0.0,
        abs_tol=1e-12,
    ):
        raise BenchmarkError("Calibration Recall@3 differs between cases and metrics")
    record_candidate_p95 = latency_summary(
        [record.get("candidate", {}).get("generationLatencyMs") for record in typo_records]
    )["p95"]
    metric_candidate_p95 = (
        metrics.get("latencyMs", {}).get("candidateGeneration", {}).get("p95")
    )
    if record_candidate_p95 != metric_candidate_p95:
        raise BenchmarkError("Calibration candidate p95 differs between cases and metrics")

    return records, metrics, {
        "casesSha256": actual_cases_sha256,
        "metricsSha256": actual_metrics_sha256,
    }


def _spelling_result_from_record(record: dict[str, Any]):
    from backend.app.retrieval.spelling_candidates import (
        SpellingCandidate,
        SpellingCandidateResult,
    )

    term = record.get("typo") if record.get("caseType") == "typo" else record.get("term")
    if not isinstance(term, str) or not term:
        raise BenchmarkError(f"Replay record {record.get('id')!r} has no term")
    candidate = record.get("candidate")
    if not isinstance(candidate, dict):
        raise BenchmarkError(f"Replay record {record.get('id')!r} has no candidate object")
    items = candidate.get("items")
    if not isinstance(items, list):
        raise BenchmarkError(f"Replay record {record.get('id')!r} candidate.items must be a list")

    rebuilt_candidates = []
    for expected_rank, item in enumerate(items, start=1):
        if not isinstance(item, dict) or item.get("rank") != expected_rank:
            raise BenchmarkError(
                f"Replay record {record.get('id')!r} candidate ranks are not contiguous",
            )
        lemma = item.get("lemma")
        edit_distance = item.get("editDistance")
        rank_key = item.get("rankKey")
        scope_codes = item.get("scopeCodes")
        reason_codes = item.get("reasonCodes")
        if (
            not isinstance(lemma, str)
            or isinstance(edit_distance, bool)
            or not isinstance(edit_distance, int)
            or not isinstance(rank_key, list)
            or not isinstance(scope_codes, list)
            or not all(isinstance(value, str) for value in scope_codes)
            or not isinstance(reason_codes, list)
            or not all(isinstance(value, str) for value in reason_codes)
        ):
            raise BenchmarkError(
                f"Replay record {record.get('id')!r} has an invalid serialized candidate",
            )
        rebuilt_candidates.append(
            SpellingCandidate(
                lemma=lemma,
                edit_distance=edit_distance,
                in_active_exam_scope=item.get("inActiveExamScope") is True,
                scope_codes=tuple(scope_codes),
                source_kind=str(item.get("sourceKind") or "unknown"),
                reason_codes=tuple(reason_codes),
                rank_key=tuple(rank_key),
            )
        )

    status = candidate.get("status")
    if not isinstance(status, str):
        raise BenchmarkError(f"Replay record {record.get('id')!r} candidate.status is invalid")
    return term, SpellingCandidateResult(
        term=term,
        status=status,
        input_is_known_word=candidate.get("inputIsKnownWord") is True,
        global_competition_complete=candidate.get("globalCompetitionComplete") is True,
        candidates=tuple(rebuilt_candidates),
        lexicon_version=str(candidate.get("lexiconVersion") or "offline-calibration-artifact"),
    )


def _policy_replay_markdown(result: dict[str, Any], artifacts: dict[str, Path]) -> str:
    decision = result["decisionReplay"]
    inherited = result["inheritedEvidence"]
    readiness = result["readiness"]
    precision = decision["autoCorrectionPrecision"]
    precision_text = "n/a" if precision is None else f"{precision * 100:.2f}%"
    lines = [
        "# Calibration Spelling Policy Offline Replay",
        "",
        f"- Cases artifact SHA-256：`{result['baseArtifacts']['casesJsonl']['sha256']}`",
        f"- Metrics artifact SHA-256：`{result['baseArtifacts']['metricsJson']['sha256']}`",
        f"- Decision source SHA-256：`{result['policySource']['sha256']}`",
        f"- typo records：`{result['inputValidation']['typoCaseCount']}`",
        "- candidate provider calls：`0`（只重放序列化候选）",
        "",
        "## Decision replay",
        "",
        f"- auto correct：`{decision['autoCorrectionCount']}`",
        f"- auto correct correct：`{decision['autoCorrectionCorrectCount']}`",
        f"- auto precision：`{precision_text}`",
        f"- auto coverage：`{decision['autoCorrectionCoverage'] * 100:.2f}%`",
        f"- clarify：`{decision['clarificationCount']}`",
        f"- safe no-match：`{decision['safeNoMatchCount']}`",
        "",
        "## Inherited candidate evidence",
        "",
        f"- Recall@3：`{inherited['candidateRecallAt3']['value']}`",
        f"- warm candidate p95：`{inherited['warmCandidateP95Ms']['value']} ms`",
        f"- candidate index RSS delta：`{inherited['candidateIndexRssDeltaBytes']['value']} bytes`",
        "",
        "## Readiness",
        "",
        f"- passed：`{readiness['passed']}`",
    ]
    for gate_name, gate in readiness["gates"].items():
        lines.append(
            f"- `{gate_name}`：actual=`{gate.get('actual')}`，threshold=`{gate.get('threshold')}`，passed=`{gate.get('passed')}`"
        )
    lines.extend(
        [
            "",
            "## Output",
            "",
            f"- JSON：`{artifacts['json']}`",
            f"- Markdown：`{artifacts['markdown']}`",
            "",
        ]
    )
    return "\n".join(lines)


def run_policy_replay(
    *,
    calibration_cases_path: Path,
    calibration_metrics_path: Path,
    expected_cases_sha256: str,
    expected_metrics_sha256: str,
    output_dir: Path,
) -> tuple[dict[str, Any], dict[str, Path]]:
    """Replay only SpellingDecisionPolicy over pinned calibration candidates."""

    from backend.app.retrieval.spelling_decision import SpellingDecisionPolicy

    validate_replay_output_dir(output_dir)
    records, base_metrics, artifact_hashes = validate_policy_replay_artifacts(
        calibration_cases_path=calibration_cases_path,
        calibration_metrics_path=calibration_metrics_path,
        expected_cases_sha256=expected_cases_sha256,
        expected_metrics_sha256=expected_metrics_sha256,
    )
    artifacts = replay_policy_artifact_paths(output_dir)
    existing = [path for path in artifacts.values() if path.exists()]
    if existing:
        raise BenchmarkError(
            "Policy replay output already exists; refusing to overwrite: "
            + ", ".join(str(path.resolve()) for path in existing),
        )

    policy = SpellingDecisionPolicy()
    typo_records = [record for record in records if record.get("caseType") == "typo"]
    case_decisions: list[dict[str, Any]] = []
    decision_counts: Counter[str] = Counter()
    auto_correct_count = 0
    auto_correct_correct_count = 0
    changed_count = 0
    for record in typo_records:
        term, candidate_result = _spelling_result_from_record(record)
        decision = policy.decide(term, candidate_result)
        selected_lemmas = [candidate.lemma for candidate in decision.candidates]
        acceptable = {
            value.strip().lower()
            for value in record.get("acceptableGolds", [])
            if isinstance(value, str)
        }
        correct = bool(acceptable & {lemma.lower() for lemma in selected_lemmas})
        decision_counts[decision.kind] += 1
        if decision.kind == "auto_correct":
            auto_correct_count += 1
            auto_correct_correct_count += correct
        base_decision = record.get("decision", {})
        changed = (
            base_decision.get("kind") != decision.kind
            or base_decision.get("reasonCode") != decision.reason_code
            or base_decision.get("selectedLemmas") != selected_lemmas
        )
        changed_count += changed
        case_decisions.append(
            {
                "id": record["id"],
                "typo": term,
                "acceptableGolds": sorted(acceptable),
                "baseDecision": {
                    "kind": base_decision.get("kind"),
                    "reasonCode": base_decision.get("reasonCode"),
                    "selectedLemmas": base_decision.get("selectedLemmas", []),
                },
                "replayDecision": {
                    "kind": decision.kind,
                    "reasonCode": decision.reason_code,
                    "selectedLemmas": selected_lemmas,
                    "correct": decision.kind == "auto_correct" and correct,
                },
                "changed": changed,
            }
        )

    fixture_results: dict[str, dict[str, Any]] = {}
    for case_type in ("valid_word", "ambiguous_typo", "random_string"):
        rows = [record for record in records if record.get("caseType") == case_type]
        passed_count = 0
        replayed = []
        for record in rows:
            term, candidate_result = _spelling_result_from_record(record)
            decision = policy.decide(term, candidate_result)
            expected = record.get("expectedDecision")
            protected = decision.kind == expected
            if case_type == "valid_word":
                protected = protected and candidate_result.input_is_known_word is True
            elif case_type == "random_string":
                protected = protected and candidate_result.input_is_known_word is False
            passed_count += protected
            replayed.append(
                {
                    "id": record.get("id"),
                    "term": term,
                    "expectedDecision": expected,
                    "replayDecision": decision.kind,
                    "reasonCode": decision.reason_code,
                    "passed": protected,
                }
            )
        fixture_results[case_type] = {
            "total": len(rows),
            "passedCount": passed_count,
            "passRate": ratio(passed_count, len(rows)),
            "cases": replayed,
        }

    auto_precision = (
        ratio(auto_correct_correct_count, auto_correct_count)
        if auto_correct_count
        else None
    )
    candidate_recall_at3 = float(base_metrics["quality"]["candidateRecallAtK"]["3"])
    candidate_p95 = base_metrics["latencyMs"]["candidateGeneration"]["p95"]
    rss_delta = base_metrics["latencyMs"]["coldLoad"]["candidateIndexRssDeltaBytes"]
    gates: dict[str, dict[str, Any]] = {
        "autoCorrectionPrecision": {
            "actual": auto_precision,
            "threshold": 0.98,
            "passed": auto_precision is None or auto_precision >= 0.98,
            "zeroAutoCorrectionPolicy": (
                "precision_is_none_but_passes_because_auto_coverage_has_no_minimum"
                if auto_precision is None
                else None
            ),
        },
        "candidateRecallAt3": {
            "actual": candidate_recall_at3,
            "threshold": 0.85,
            "passed": candidate_recall_at3 >= 0.85,
        },
        "warmCandidateP95Ms": {
            "actual": candidate_p95,
            "threshold": 150.0,
            "passed": isinstance(candidate_p95, (int, float)) and candidate_p95 <= 150.0,
        },
        "candidateIndexRssDeltaBytes": {
            "actual": rss_delta,
            "threshold": 100 * 1024 * 1024,
            "passed": isinstance(rss_delta, int) and rss_delta <= 100 * 1024 * 1024,
        },
        "validWordProtectionRate": {
            "actual": fixture_results["valid_word"]["passRate"],
            "threshold": 1.0,
            "passed": fixture_results["valid_word"]["passRate"] == 1.0,
        },
        "ambiguousClarificationRate": {
            "actual": fixture_results["ambiguous_typo"]["passRate"],
            "threshold": 1.0,
            "passed": fixture_results["ambiguous_typo"]["passRate"] == 1.0,
        },
        "randomStringProtectionRate": {
            "actual": fixture_results["random_string"]["passRate"],
            "threshold": 1.0,
            "passed": fixture_results["random_string"]["passRate"] == 1.0,
        },
    }
    base_gates = base_metrics.get("gates")
    if not isinstance(base_gates, dict):
        raise BenchmarkError("Calibration metrics gates object is missing")
    inherited_base_gates = {}
    for gate_name in POLICY_REPLAY_INHERITED_GATE_NAMES:
        gate = base_gates.get(gate_name)
        if not isinstance(gate, dict) or gate.get("passed") is not True:
            raise BenchmarkError(
                f"Calibration invariant gate is missing or failed: {gate_name}",
            )
        inherited_base_gates[gate_name] = gate
        gates[f"base:{gate_name}"] = {
            "actual": gate.get("actual"),
            "threshold": gate.get("threshold"),
            "passed": True,
        }

    decision_source = benchmark_source_versions()["decisionPolicy"]
    decision_summary = {
        "totalCases": len(typo_records),
        "autoCorrectionCount": auto_correct_count,
        "autoCorrectionCorrectCount": auto_correct_correct_count,
        "autoCorrectionPrecision": auto_precision,
        "autoCorrectionCoverage": ratio(auto_correct_count, len(typo_records)),
        "clarificationCount": decision_counts["clarify_candidates"],
        "clarificationRate": ratio(decision_counts["clarify_candidates"], len(typo_records)),
        "safeNoMatchCount": decision_counts["no_reliable_candidate"],
        "safeNoMatchRate": ratio(decision_counts["no_reliable_candidate"], len(typo_records)),
        "decisionCounts": dict(sorted(decision_counts.items())),
        "changedFromBaseCount": changed_count,
    }
    result = {
        "schemaVersion": POLICY_REPLAY_SCHEMA_VERSION,
        "generatedAtUtc": utc_now_iso(),
        "mode": "offline_calibration_policy_replay",
        "baseArtifacts": {
            "casesJsonl": {
                "path": str(calibration_cases_path.resolve()),
                "sha256": artifact_hashes["casesSha256"],
            },
            "metricsJson": {
                "path": str(calibration_metrics_path.resolve()),
                "sha256": artifact_hashes["metricsSha256"],
            },
        },
        "policySource": {
            **decision_source,
            "thresholds": asdict(policy.thresholds),
        },
        "inputValidation": {
            "artifactHashesMatched": True,
            "selectedSplit": "calibration",
            "typoCaseCount": len(typo_records),
            "fixtureCounts": POLICY_REPLAY_FIXTURE_COUNTS,
            "providerCalledCount": 0,
            "errorCount": 0,
        },
        "decisionReplay": decision_summary,
        "fixtureReplay": fixture_results,
        "inheritedEvidence": {
            "candidateRecallAt3": {
                "value": candidate_recall_at3,
                "source": "base metrics /quality/candidateRecallAtK/3",
            },
            "warmCandidateP95Ms": {
                "value": candidate_p95,
                "source": "base metrics /latencyMs/candidateGeneration/p95",
            },
            "candidateIndexRssDeltaBytes": {
                "value": rss_delta,
                "source": "base metrics /latencyMs/coldLoad/candidateIndexRssDeltaBytes",
            },
            "baseInvariantGates": inherited_base_gates,
        },
        "readiness": {
            "passed": all(gate["passed"] is True for gate in gates.values()),
            "gates": gates,
        },
        "caseDecisions": case_decisions,
    }

    output_dir.mkdir(parents=True, exist_ok=True)
    write_json(artifacts["json"], result)
    artifacts["markdown"].write_text(
        _policy_replay_markdown(result, artifacts),
        encoding="utf-8",
    )
    return result, artifacts


def run_current(
    *,
    manifest_path: Path,
    dataset_root: Path,
    wordbook_path: Path,
    ecdict_path: Path,
    source_lemma_dir: Path,
    quality_fixtures_path: Path,
    output_dir: Path,
    selected_split: str,
    limit: int | None = None,
) -> tuple[dict[str, Any], dict[str, Path]]:
    """Run the real local spelling provider and frozen decision policy provider-off."""

    from backend.app.answering.chat_tool_router import (
        build_chat_tools,
        execute_chat_tool_route,
        plan_chat_tool_route,
    )
    from backend.app.answering.ordinary_lookup import OrdinaryLookupService
    from backend.app.content.compact_exam_wordbook import CompactExamWordbookLoader
    from backend.app.content.ecdict import create_ecdict_basic_profile_lookup
    from backend.app.retrieval.repository import NullStructuredLookupRepository
    from backend.app.retrieval.spelling_candidates import EcdictSpellingCandidateProvider
    from backend.app.retrieval.spelling_decision import (
        FROZEN_DEFAULT_SPELLING_DECISION_THRESHOLDS,
        SpellingDecisionPolicy,
    )

    if selected_split not in {"calibration", "held-out"}:
        raise BenchmarkError("current --mode must be calibration or held-out")
    if limit is not None:
        raise BenchmarkError(
            "current forbids --limit; calibration requires all 481 cases and held-out requires all 1,924 cases",
        )
    if not ecdict_path.exists():
        raise BenchmarkError(f"ECDICT CSV not found: {ecdict_path}")
    verify_manifest_against_sources(dataset_root, wordbook_path, manifest_path)
    fixture_document = load_quality_fixtures(quality_fixtures_path)
    actual_ecdict_hash = sha256_file(ecdict_path)
    if fixture_document["ecdictSha256"] != actual_ecdict_hash:
        raise BenchmarkError(
            "Quality fixture ECDICT hash mismatch: "
            f"expected {fixture_document['ecdictSha256']}, got {actual_ecdict_hash}",
        )
    manifest = load_json(manifest_path)
    cases = [case for case in manifest["cases"] if case["split"] == selected_split]
    validate_current_run_selection(
        selected_split=selected_split,
        limit=limit,
        selected_case_count=len(cases),
    )

    artifacts = current_artifact_paths(output_dir, selected_split)
    heldout_receipt: Path | None = None
    if selected_split == "held-out":
        heldout_receipt = prepare_heldout_one_shot(
            output_dir=output_dir,
            artifacts=artifacts,
        )
    else:
        output_dir.mkdir(parents=True, exist_ok=True)

    # This process-local value documents and enforces the actual dictionary used;
    # the runner still avoids load_settings()/dotenv and never reads provider secrets.
    os.environ["ENGGO_ECDICT_PATH"] = str(ecdict_path.resolve())
    rss_before_ecdict = process_rss_bytes()
    ecdict_lookup = create_ecdict_basic_profile_lookup(dictionary_path=ecdict_path)
    ecdict_started = time.perf_counter_ns()
    ecdict_index = ecdict_lookup.load_index()
    ecdict_cold_load_ms = (time.perf_counter_ns() - ecdict_started) / 1_000_000
    if ecdict_index is None:
        raise BenchmarkError("ECDICT index did not load")
    rss_after_ecdict = process_rss_bytes()

    candidate_provider = EcdictSpellingCandidateProvider(
        ecdict_lookup=ecdict_lookup,
        compact_wordbook_loader=CompactExamWordbookLoader(path=wordbook_path),
    )
    decision_policy = SpellingDecisionPolicy()
    provider_cold_started = time.perf_counter_ns()
    cold_probe = candidate_provider.generate(
        term="request",
        active_exam_target="cet4",
        limit=CURRENT_CANDIDATE_LIMIT,
    )
    provider_cold_load_ms = (time.perf_counter_ns() - provider_cold_started) / 1_000_000
    if cold_probe.status != "ready" or not cold_probe.input_is_known_word:
        raise BenchmarkError(
            f"Candidate provider cold probe failed: {cold_probe.status}",
        )
    rss_after_provider = process_rss_bytes()

    def rss_delta(after: int | None, before: int | None) -> int | None:
        if after is None or before is None:
            return None
        return max(0, after - before)

    cold_load = {
        "ecdictColdLoadMs": round(ecdict_cold_load_ms, 3),
        "candidateColdLoadMs": round(provider_cold_load_ms, 3),
        "rssBeforeEcdictBytes": rss_before_ecdict,
        "rssAfterEcdictBytes": rss_after_ecdict,
        "ecdictBaseRssDeltaBytes": rss_delta(rss_after_ecdict, rss_before_ecdict),
        "rssAfterCandidateProviderBytes": rss_after_provider,
        "candidateIndexRssDeltaBytes": rss_delta(rss_after_provider, rss_after_ecdict),
        "candidateColdProbe": "request",
        "warmLatencyExcludesColdProbe": True,
    }

    class ReplayCandidateProvider:
        def __init__(self) -> None:
            self.current = None
            self.expected_term: str | None = None
            self.expected_target: str | None = None

        def generate(
            self,
            *,
            term: str,
            active_exam_target: str,
            limit: int = CURRENT_CANDIDATE_LIMIT,
        ):
            if (
                self.current is None
                or term != self.expected_term
                or active_exam_target != self.expected_target
                or limit != CURRENT_CANDIDATE_LIMIT
            ):
                raise BenchmarkError("Runtime spelling call differs from measured provider call")
            return self.current

    replay_provider = ReplayCandidateProvider()
    ordinary_service = OrdinaryLookupService(
        repository=NullStructuredLookupRepository(),
        source_lemma_base_dir=source_lemma_dir,
        ecdict_lookup=ecdict_lookup,
        provider=None,
        spelling_candidate_provider=replay_provider,
        spelling_decision_policy=decision_policy,
    )
    tools = build_chat_tools(
        ordinary_lookup_service=ordinary_service,
        direct_compare_service=None,
        advanced_lookup_service=None,
    )
    if ordinary_service.provider is not None:
        raise BenchmarkError("Current benchmark must remain provider-off")

    environment = baseline_environment(
        manifest_path=manifest_path,
        wordbook_path=wordbook_path,
        ecdict_path=ecdict_path,
        dataset_root=dataset_root,
    )
    environment.update(
        {
            "repository": "NullStructuredLookupRepository",
            "providerMode": "off",
            "candidateProvider": "EcdictSpellingCandidateProvider",
            "candidateLimit": CURRENT_CANDIDATE_LIMIT,
            "decisionPolicy": "SpellingDecisionPolicy",
            "decisionThresholds": asdict(FROZEN_DEFAULT_SPELLING_DECISION_THRESHOLDS),
            "qualityFixturesPath": str(quality_fixtures_path.resolve()),
            "qualityFixturesSha256": sha256_file(quality_fixtures_path),
            "effectiveEnggoEcdictPath": os.environ["ENGGO_ECDICT_PATH"],
            "sourceFiles": benchmark_source_versions(),
        }
    )

    typo_records: list[dict[str, Any]] = []
    fixture_records: list[dict[str, Any]] = []
    route_slot_records: list[dict[str, Any]] = []
    run_started = time.perf_counter_ns()

    for index, case in enumerate(cases, start=1):
        query = f"{case['typo']} 是什么意思"
        case_started = time.perf_counter_ns()
        route_started = time.perf_counter_ns()
        route_plan = plan_chat_tool_route(
            query=query,
            active_exam_target=case["activeExamTarget"],
        )
        route_elapsed_ms = (time.perf_counter_ns() - route_started) / 1_000_000
        actual_terms = route_plan.normalized_query.get("englishTerms")
        if not isinstance(actual_terms, list):
            actual_terms = []

        candidate_started = time.perf_counter_ns()
        candidate_result = candidate_provider.generate(
            term=case["typo"],
            active_exam_target=case["activeExamTarget"],
            limit=CURRENT_CANDIDATE_LIMIT,
        )
        candidate_elapsed_ms = (time.perf_counter_ns() - candidate_started) / 1_000_000
        decision_started = time.perf_counter_ns()
        decision = decision_policy.decide(case["typo"], candidate_result)
        decision_elapsed_ms = (time.perf_counter_ns() - decision_started) / 1_000_000
        serialized_candidates = [
            serialize_spelling_candidate(candidate, rank=rank)
            for rank, candidate in enumerate(candidate_result.candidates, start=1)
        ]
        candidate_lemmas = [
            candidate["lemma"]
            for candidate in serialized_candidates
            if isinstance(candidate.get("lemma"), str)
        ]
        gold_rank = first_acceptable_rank(candidate_lemmas, case["acceptableGolds"])
        decision_lemmas = [candidate.lemma for candidate in decision.candidates]
        decision_correct = bool(
            set(decision_lemmas) & set(case["acceptableGolds"])
        )

        replay_provider.current = candidate_result
        replay_provider.expected_term = case["typo"]
        replay_provider.expected_target = case["activeExamTarget"]
        execution_started = time.perf_counter_ns()
        execution = None
        error_message = None
        try:
            execution = execute_chat_tool_route(
                route_plan=route_plan,
                tools=tools,
                request_id=f"benchmark-current-{case['id']}",
                history=[],
            )
        except Exception as error:
            error_message = f"{type(error).__name__}: {error}"
        execution_elapsed_ms = (time.perf_counter_ns() - execution_started) / 1_000_000

        grounding: dict[str, Any] = {}
        status_code = None
        answer_kind = None
        tool_name = None
        if execution is not None:
            tool_name = execution.tool_name
            status_code = execution.status_code
            answer_kind = execution.payload.answerKind
            if isinstance(execution.payload.grounding, dict):
                grounding = execution.payload.grounding
        selected_lemmas = extract_lemmas(grounding.get("mainAnswer"))
        for lemma in extract_lemmas(grounding.get("confusionBoundary")):
            if lemma not in selected_lemmas:
                selected_lemmas.append(lemma)
        total_elapsed_ms = (time.perf_counter_ns() - case_started) / 1_000_000
        record = {
            "caseType": "typo",
            "caseIndex": index,
            "id": case["id"],
            "typo": case["typo"],
            "gold": case["gold"],
            "acceptableGolds": case["acceptableGolds"],
            "collisionGroupId": case["collisionGroupId"],
            "collisionGroupSize": case["collisionGroupSize"],
            "split": case["split"],
            "stratumKey": case["stratum"]["key"],
            "stratum": case["stratum"],
            "activeExamTarget": case["activeExamTarget"],
            "query": query,
            "route": {
                "expectedQueryMode": "fuzzy_recall",
                "actualQueryMode": route_plan.query_mode,
                "expectedTool": "ordinary_lookup",
                "plannedTools": list(route_plan.tool_names),
                "executedTool": tool_name,
                "source": route_plan.source,
                "confidence": route_plan.confidence,
                "ambiguityReasons": list(route_plan.ambiguity_reasons),
                "correct": (
                    route_plan.query_mode == "fuzzy_recall"
                    and bool(route_plan.tool_names)
                    and route_plan.tool_names[0] == "ordinary_lookup"
                    and tool_name == "ordinary_lookup"
                ),
            },
            "slot": {
                "expectedTerms": [case["typo"]],
                "actualTerms": actual_terms,
                "exact": actual_terms == [case["typo"]],
                "tokenF1": token_f1(actual_terms, [case["typo"]]),
            },
            "candidate": {
                "status": candidate_result.status,
                "inputIsKnownWord": candidate_result.input_is_known_word,
                "globalCompetitionComplete": candidate_result.global_competition_complete,
                "lexiconVersion": candidate_result.lexicon_version,
                "items": serialized_candidates,
                "lemmas": candidate_lemmas,
                "count": len(candidate_lemmas),
                "goldRank": gold_rank,
                "recallAt1": isinstance(gold_rank, int) and gold_rank <= 1,
                "recallAt3": isinstance(gold_rank, int) and gold_rank <= 3,
                "recallAt5": isinstance(gold_rank, int) and gold_rank <= 5,
                "reciprocalRank": 1 / gold_rank if isinstance(gold_rank, int) else 0.0,
                "scopeOutcome": candidate_scope_outcome(
                    serialized_candidates,
                    case["acceptableGolds"],
                ),
                "generationLatencyMs": candidate_elapsed_ms,
            },
            "decision": {
                "kind": decision.kind,
                "reasonCode": decision.reason_code,
                "selectedLemmas": decision_lemmas,
                "correct": decision.kind == "auto_correct" and decision_correct,
                "latencyMs": decision_elapsed_ms,
            },
            "outcome": {
                "statusCode": status_code,
                "answerKind": answer_kind,
                "resolution": grounding.get("resolution"),
                "noMatchReason": grounding.get("noMatchReason"),
                "matchType": grounding.get("matchType"),
                "spellingDecision": grounding.get("spellingDecision"),
                "selectedLemmas": selected_lemmas,
                "providerCalled": False,
                "providerOutcome": "not_configured",
                "recoveryKind": "none",
            },
            "latencyMs": {
                "route": route_elapsed_ms,
                "toolExecution": execution_elapsed_ms,
                "total": total_elapsed_ms,
            },
            "error": error_message,
        }
        typo_records.append(record)
        if index % 100 == 0 or index == len(cases):
            print(f"current {selected_split} progress: {index}/{len(cases)}", flush=True)

    for section_name, case_type in (
        ("validWords", "valid_word"),
        ("ambiguousTypos", "ambiguous_typo"),
        ("randomStrings", "random_string"),
    ):
        for fixture in fixture_document[section_name]:
            started = time.perf_counter_ns()
            result = candidate_provider.generate(
                term=fixture["term"],
                active_exam_target=fixture["activeExamTarget"],
                limit=CURRENT_CANDIDATE_LIMIT,
            )
            candidate_ms = (time.perf_counter_ns() - started) / 1_000_000
            decision_started = time.perf_counter_ns()
            decision = decision_policy.decide(fixture["term"], result)
            decision_ms = (time.perf_counter_ns() - decision_started) / 1_000_000
            accepted = fixture.get("acceptableGolds", [])
            decision_lemmas = [candidate.lemma for candidate in decision.candidates]
            fixture_records.append(
                {
                    "caseType": case_type,
                    **fixture,
                    "candidate": {
                        "status": result.status,
                        "inputIsKnownWord": result.input_is_known_word,
                        "globalCompetitionComplete": result.global_competition_complete,
                        "items": [
                            serialize_spelling_candidate(candidate, rank=rank)
                            for rank, candidate in enumerate(result.candidates, start=1)
                        ],
                        "generationLatencyMs": candidate_ms,
                    },
                    "decision": {
                        "kind": decision.kind,
                        "reasonCode": decision.reason_code,
                        "selectedLemmas": decision_lemmas,
                        "correct": bool(set(decision_lemmas) & set(accepted)),
                        "latencyMs": decision_ms,
                    },
                    "expectedDecision": fixture.get(
                        "expectedDecision",
                        "no_reliable_candidate" if case_type == "valid_word" else None,
                    ),
                    "outcome": {
                        "resolution": decision_resolution(decision.kind),
                        "noMatchReason": (
                            decision.reason_code
                            if decision.kind == "no_reliable_candidate"
                            else None
                        ),
                    },
                    "error": None,
                }
            )

    for fixture in fixture_document["routeSlotCases"]:
        started = time.perf_counter_ns()
        plan = plan_chat_tool_route(
            query=fixture["query"],
            active_exam_target=fixture["activeExamTarget"],
        )
        route_ms = (time.perf_counter_ns() - started) / 1_000_000
        actual_terms = plan.normalized_query.get("englishTerms")
        if not isinstance(actual_terms, list):
            actual_terms = []
        expected_terms = fixture["expectedEnglishTerms"]
        route_slot_records.append(
            {
                "caseType": "route_slot",
                **fixture,
                "route": {
                    "actualQueryMode": plan.query_mode,
                    "plannedTools": list(plan.tool_names),
                    "source": plan.source,
                    "confidence": plan.confidence,
                    "correct": (
                        plan.query_mode == fixture["expectedQueryMode"]
                        and bool(plan.tool_names)
                        and plan.tool_names[0] == fixture["expectedTool"]
                    ),
                },
                "slot": {
                    "actualTerms": actual_terms,
                    "exact": actual_terms == expected_terms,
                    "tokenF1": token_f1(actual_terms, expected_terms),
                },
                "latencyMs": {"route": route_ms},
                "error": None,
            }
        )

    run_duration_ms = (time.perf_counter_ns() - run_started) / 1_000_000
    all_records = [*typo_records, *fixture_records, *route_slot_records]
    with artifacts["jsonl"].open("w", encoding="utf-8", newline="\n") as handle:
        for record in all_records:
            handle.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")
    metrics = summarize_current_records(
        typo_records,
        fixture_records,
        route_slot_records,
        environment=environment,
        selected_split=selected_split,
        run_duration_ms=run_duration_ms,
        cold_load=cold_load,
    )
    write_json(artifacts["metrics"], metrics)
    artifacts["markdown"].write_text(
        current_markdown_summary(metrics, artifacts),
        encoding="utf-8",
    )
    if heldout_receipt is not None:
        complete_heldout_one_shot(heldout_receipt, metrics)
    if metrics["quality"]["providerCalledCount"]:
        raise BenchmarkError("Provider was called during provider-off current benchmark")
    if metrics["quality"]["errorCount"]:
        raise BenchmarkError(
            f"Current benchmark completed with {metrics['quality']['errorCount']} errors; inspect {artifacts['jsonl']}",
        )
    return metrics, artifacts


def run_baseline(
    *,
    manifest_path: Path,
    dataset_root: Path,
    wordbook_path: Path,
    ecdict_path: Path,
    source_lemma_dir: Path,
    output_dir: Path,
    selected_split: str,
    limit: int | None = None,
) -> tuple[dict[str, Any], dict[str, Path]]:
    # These imports intentionally avoid backend.app.core.config so .env is never loaded.
    from backend.app.answering.chat_tool_router import (
        build_chat_tools,
        execute_chat_tool_route,
        plan_chat_tool_route,
    )
    from backend.app.answering.ordinary_lookup import OrdinaryLookupService
    from backend.app.content.ecdict import create_ecdict_basic_profile_lookup
    from backend.app.retrieval.repository import NullStructuredLookupRepository

    verify_manifest_against_sources(dataset_root, wordbook_path, manifest_path)
    document = load_json(manifest_path)
    all_cases = document["cases"]
    cases = [
        case
        for case in all_cases
        if selected_split == "all" or case["split"] == selected_split
    ]
    if limit is not None:
        if limit <= 0:
            raise BenchmarkError("--limit must be positive")
        cases = cases[:limit]
    if not cases:
        raise BenchmarkError(f"No cases selected for split={selected_split!r}")
    if not ecdict_path.exists():
        raise BenchmarkError(f"ECDICT CSV not found: {ecdict_path}")

    class RecordingNullStructuredLookupRepository(NullStructuredLookupRepository):
        def __init__(self) -> None:
            self.last_candidate_elapsed_ms: float | None = None
            self.last_candidates: list[Any] = []

        def reset_observation(self) -> None:
            self.last_candidate_elapsed_ms = None
            self.last_candidates = []

        def find_english_candidates(self, active_exam_target: str, needle: str):
            started = time.perf_counter_ns()
            candidates = super().find_english_candidates(active_exam_target, needle)
            self.last_candidate_elapsed_ms = (time.perf_counter_ns() - started) / 1_000_000
            self.last_candidates = list(candidates)
            return candidates

    repository = RecordingNullStructuredLookupRepository()
    ecdict_lookup = create_ecdict_basic_profile_lookup(dictionary_path=ecdict_path)
    ordinary_service = OrdinaryLookupService(
        repository=repository,
        source_lemma_base_dir=source_lemma_dir,
        ecdict_lookup=ecdict_lookup,
        provider=None,
    )
    if ordinary_service.provider is not None:
        raise BenchmarkError("Baseline provider must be None")
    tools = build_chat_tools(
        ordinary_lookup_service=ordinary_service,
        direct_compare_service=None,
        advanced_lookup_service=None,
    )

    output_dir.mkdir(parents=True, exist_ok=True)
    artifacts = {
        "jsonl": output_dir / "baseline-cases.jsonl",
        "metrics": output_dir / "baseline-metrics.json",
        "markdown": output_dir / "baseline-summary.md",
    }
    environment = baseline_environment(
        manifest_path=manifest_path,
        wordbook_path=wordbook_path,
        ecdict_path=ecdict_path,
        dataset_root=dataset_root,
    )

    records: list[dict[str, Any]] = []
    run_started = time.perf_counter_ns()
    with artifacts["jsonl"].open("w", encoding="utf-8", newline="\n") as jsonl_handle:
        for index, case in enumerate(cases, start=1):
            repository.reset_observation()
            query = f"{case['typo']} 是什么意思"
            case_started = time.perf_counter_ns()
            route_started = time.perf_counter_ns()
            route_plan = plan_chat_tool_route(
                query=query,
                active_exam_target=case["activeExamTarget"],
            )
            route_elapsed_ms = (time.perf_counter_ns() - route_started) / 1_000_000
            expected_terms = [case["typo"]]
            actual_terms = route_plan.normalized_query.get("englishTerms")
            if not isinstance(actual_terms, list):
                actual_terms = []

            execution_started = time.perf_counter_ns()
            execution = None
            error_message = None
            try:
                execution = execute_chat_tool_route(
                    route_plan=route_plan,
                    tools=tools,
                    request_id=f"benchmark-{case['id']}",
                    history=[],
                )
            except Exception as error:  # Keep the full baseline artifact even if one case fails.
                error_message = f"{type(error).__name__}: {error}"
            execution_elapsed_ms = (time.perf_counter_ns() - execution_started) / 1_000_000

            grounding: dict[str, Any] = {}
            status_code = None
            answer_kind = None
            provider_request_id = None
            tool_name = None
            if execution is not None:
                tool_name = execution.tool_name
                status_code = execution.status_code
                answer_kind = execution.payload.answerKind
                provider_request_id = execution.payload.providerRequestId
                if isinstance(execution.payload.grounding, dict):
                    grounding = execution.payload.grounding
            elif error_message is None:
                error_message = "No chat tool produced a result"

            candidate_lemmas = [
                candidate.lemma.strip().lower()
                for candidate in repository.last_candidates
                if isinstance(getattr(candidate, "lemma", None), str)
            ]
            gold_rank = (
                candidate_lemmas.index(case["gold"]) + 1
                if case["gold"] in candidate_lemmas
                else None
            )
            selected_lemmas = extract_lemmas(grounding.get("mainAnswer"))
            selected_lemmas.extend(
                lemma
                for lemma in extract_lemmas(grounding.get("confusionBoundary"))
                if lemma not in selected_lemmas
            )
            total_elapsed_ms = (time.perf_counter_ns() - case_started) / 1_000_000
            record = {
                "caseIndex": index,
                "id": case["id"],
                "typo": case["typo"],
                "gold": case["gold"],
                "acceptableGolds": case["acceptableGolds"],
                "split": case["split"],
                "stratumKey": case["stratum"]["key"],
                "activeExamTarget": case["activeExamTarget"],
                "query": query,
                "route": {
                    "expectedQueryMode": "fuzzy_recall",
                    "actualQueryMode": route_plan.query_mode,
                    "expectedTool": "ordinary_lookup",
                    "plannedTools": list(route_plan.tool_names),
                    "executedTool": tool_name,
                    "source": route_plan.source,
                    "confidence": route_plan.confidence,
                    "ambiguityReasons": list(route_plan.ambiguity_reasons),
                    "correct": (
                        route_plan.query_mode == "fuzzy_recall"
                        and bool(route_plan.tool_names)
                        and route_plan.tool_names[0] == "ordinary_lookup"
                        and tool_name == "ordinary_lookup"
                    ),
                },
                "slot": {
                    "expectedTerms": expected_terms,
                    "actualTerms": actual_terms,
                    "exact": actual_terms == expected_terms,
                    "tokenF1": token_f1(actual_terms, expected_terms),
                },
                "candidate": {
                    "lemmas": candidate_lemmas[:5],
                    "count": len(candidate_lemmas),
                    "goldRank": gold_rank,
                    "recallAt1": isinstance(gold_rank, int) and gold_rank <= 1,
                    "recallAt3": isinstance(gold_rank, int) and gold_rank <= 3,
                    "recallAt5": isinstance(gold_rank, int) and gold_rank <= 5,
                    "reciprocalRank": 1 / gold_rank if isinstance(gold_rank, int) else 0.0,
                    "generationLatencyMs": repository.last_candidate_elapsed_ms,
                },
                "outcome": {
                    "statusCode": status_code,
                    "answerKind": answer_kind,
                    "resolution": grounding.get("resolution"),
                    "noMatchReason": grounding.get("noMatchReason"),
                    "matchType": grounding.get("matchType"),
                    "selectedLemmas": selected_lemmas,
                    "providerCalled": provider_request_id is not None,
                    "providerOutcome": "not_configured",
                    "recoveryKind": "none",
                },
                "latencyMs": {
                    "route": route_elapsed_ms,
                    "toolExecution": execution_elapsed_ms,
                    "total": total_elapsed_ms,
                },
                "error": error_message,
            }
            records.append(record)
            jsonl_handle.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")

            if index % 250 == 0 or index == len(cases):
                print(f"baseline progress: {index}/{len(cases)}", flush=True)

    run_duration_ms = (time.perf_counter_ns() - run_started) / 1_000_000
    metrics = summarize_baseline_records(
        records,
        environment=environment,
        selected_split=selected_split,
        run_duration_ms=run_duration_ms,
    )
    write_json(artifacts["metrics"], metrics)
    artifacts["markdown"].write_text(
        markdown_summary(metrics, artifacts),
        encoding="utf-8",
    )

    if metrics["quality"]["providerCalledCount"]:
        raise BenchmarkError("Provider was called during provider-off baseline")
    if metrics["quality"]["errorCount"]:
        raise BenchmarkError(
            f"Baseline completed with {metrics['quality']['errorCount']} runner errors; inspect {artifacts['jsonl']}"
        )
    return metrics, artifacts


def add_source_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--dataset-root", type=Path, default=DEFAULT_DATASET_ROOT)
    parser.add_argument("--wordbook", type=Path, default=DEFAULT_WORDBOOK_PATH)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST_PATH)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Prepare, verify, and run the pinned EngGo spelling-recovery benchmark.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    prepare_parser = subparsers.add_parser("prepare", help="Build the deterministic manifest")
    add_source_arguments(prepare_parser)

    verify_parser = subparsers.add_parser("verify", help="Rebuild and verify the checked-in manifest")
    add_source_arguments(verify_parser)

    baseline_parser = subparsers.add_parser(
        "baseline",
        help="Run the current provider-off Null-repository baseline",
    )
    add_source_arguments(baseline_parser)
    baseline_parser.add_argument("--ecdict", type=Path, default=DEFAULT_ECDICT_PATH)
    baseline_parser.add_argument(
        "--source-lemma-dir",
        type=Path,
        default=DEFAULT_SOURCE_LEMMA_DIR,
    )
    baseline_parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    baseline_parser.add_argument(
        "--split",
        choices=("all", "calibration", "held-out"),
        default="all",
    )
    baseline_parser.add_argument(
        "--provider-off",
        action="store_true",
        help="Explicit marker; baseline is always provider-off and never loads .env.",
    )
    baseline_parser.add_argument("--limit", type=int, default=None, help=argparse.SUPPRESS)

    current_parser = subparsers.add_parser(
        "current",
        help="Run the real local spelling provider and frozen decision policy provider-off",
    )
    add_source_arguments(current_parser)
    current_parser.add_argument("--ecdict", type=Path, default=DEFAULT_ECDICT_PATH)
    current_parser.add_argument(
        "--source-lemma-dir",
        type=Path,
        default=DEFAULT_SOURCE_LEMMA_DIR,
    )
    current_parser.add_argument(
        "--quality-fixtures",
        type=Path,
        default=DEFAULT_QUALITY_FIXTURES_PATH,
    )
    current_parser.add_argument("--output-dir", type=Path, default=None)
    current_parser.add_argument(
        "--mode",
        choices=("calibration", "held-out"),
        required=True,
        help="Calibration tunes thresholds; held-out is the one-shot final gate.",
    )
    current_parser.add_argument(
        "--provider-off",
        action="store_true",
        help="Required explicit marker; current retrieval metrics never load a provider.",
    )

    replay_parser = subparsers.add_parser(
        "replay-policy",
        help="Offline replay of the current spelling decision policy over pinned calibration artifacts",
    )
    replay_parser.add_argument("--calibration-cases", type=Path, required=True)
    replay_parser.add_argument("--calibration-metrics", type=Path, required=True)
    replay_parser.add_argument("--calibration-cases-sha256", required=True)
    replay_parser.add_argument("--calibration-metrics-sha256", required=True)
    replay_parser.add_argument("--output-dir", type=Path, required=True)
    return parser


def print_manifest_summary(document: dict[str, Any], manifest_path: Path) -> None:
    print(
        json.dumps(
            {
                "manifest": str(manifest_path.resolve()),
                "pairCount": document["pairSet"]["count"],
                "pairSetSha256": document["pairSet"]["sha256"],
                "uniqueTypoCount": document["pairSet"]["uniqueTypoCount"],
                "collisionGroupCount": document["pairSet"]["collisionGroupCount"],
                "calibrationCount": document["split"]["calibrationCount"],
                "heldOutCount": document["split"]["heldOutCount"],
            },
            ensure_ascii=False,
            indent=2,
        )
    )


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.command == "prepare":
            document = prepare_manifest(args.dataset_root, args.wordbook, args.manifest)
            print_manifest_summary(document, args.manifest)
            return 0
        if args.command == "verify":
            document = verify_manifest_against_sources(
                args.dataset_root,
                args.wordbook,
                args.manifest,
            )
            print_manifest_summary(document, args.manifest)
            return 0
        if args.command == "baseline":
            metrics, artifacts = run_baseline(
                manifest_path=args.manifest,
                dataset_root=args.dataset_root,
                wordbook_path=args.wordbook,
                ecdict_path=args.ecdict,
                source_lemma_dir=args.source_lemma_dir,
                output_dir=args.output_dir,
                selected_split=args.split,
                limit=args.limit,
            )
            print(json.dumps(metrics["quality"], ensure_ascii=False, indent=2))
            print(f"JSONL: {artifacts['jsonl'].resolve()}")
            print(f"Metrics: {artifacts['metrics'].resolve()}")
            print(f"Markdown: {artifacts['markdown'].resolve()}")
            return 0
        if args.command == "current":
            if not args.provider_off:
                raise BenchmarkError("current requires the explicit --provider-off marker")
            if args.mode == "held-out" and args.output_dir is not None:
                raise BenchmarkError(
                    "held-out uses the fixed one-shot output directory; --output-dir is forbidden",
                )
            output_dir = args.output_dir or (DEFAULT_CURRENT_OUTPUT_ROOT / args.mode)
            metrics, artifacts = run_current(
                manifest_path=args.manifest,
                dataset_root=args.dataset_root,
                wordbook_path=args.wordbook,
                ecdict_path=args.ecdict,
                source_lemma_dir=args.source_lemma_dir,
                quality_fixtures_path=args.quality_fixtures,
                output_dir=output_dir,
                selected_split=args.mode,
            )
            print(json.dumps(metrics["quality"], ensure_ascii=False, indent=2))
            print(json.dumps(metrics["gates"], ensure_ascii=False, indent=2))
            print(f"JSONL: {artifacts['jsonl'].resolve()}")
            print(f"Metrics: {artifacts['metrics'].resolve()}")
            print(f"Markdown: {artifacts['markdown'].resolve()}")
            if args.mode == "held-out" and metrics["gateSummary"]["finalGatePassed"] is not True:
                print(
                    "held-out completed and artifacts were preserved, but one or more final gates failed",
                    file=sys.stderr,
                )
                return 3
            return 0
        if args.command == "replay-policy":
            result, artifacts = run_policy_replay(
                calibration_cases_path=args.calibration_cases,
                calibration_metrics_path=args.calibration_metrics,
                expected_cases_sha256=args.calibration_cases_sha256,
                expected_metrics_sha256=args.calibration_metrics_sha256,
                output_dir=args.output_dir,
            )
            print(json.dumps(result["decisionReplay"], ensure_ascii=False, indent=2))
            print(json.dumps(result["readiness"], ensure_ascii=False, indent=2))
            print(f"JSON: {artifacts['json'].resolve()}")
            print(f"Markdown: {artifacts['markdown'].resolve()}")
            if result["readiness"]["passed"] is not True:
                print(
                    "policy replay completed and artifacts were preserved, but one or more readiness gates failed",
                    file=sys.stderr,
                )
                return 3
            return 0
        raise BenchmarkError(f"Unsupported command: {args.command}")
    except BenchmarkError as error:
        print(str(error), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
