import argparse
import io
import json
import os
import shutil
import socket
import subprocess
import sys
import tarfile
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BASELINE_REF = "52b7834"
DEFAULT_ECDICT_PATH = REPO_ROOT / "output" / "external-dictionaries" / "ecdict.csv"
TEMP_ROOT = REPO_ROOT / "tmp_model_routing_e2e_compare"
REQUEST_TIMEOUT_SECONDS = 20


def follow_context() -> dict[str, Any]:
    return {
        "version": 1,
        "activeExamTarget": "cet6",
        "sourceMessageId": "turn_1:assistant",
        "topicKind": "meaning_lookup",
        "sourceQuery": "遵循的英文是什么",
        "focus": None,
        "candidates": [
            {"index": 1, "lemma": "follow", "label": "follow"},
            {"index": 2, "lemma": "obey", "label": "obey"},
            {"index": 3, "lemma": "comply", "label": "comply"},
        ],
        "continuationCandidates": [
            {"index": 1, "lemma": "observe", "label": "observe"},
            {"index": 2, "lemma": "adhere", "label": "adhere"},
        ],
        "availableActions": [
            "collect_one",
            "switch_scope",
            "study_guidance",
            "collect_group",
            "context_choice",
            "show_more",
        ],
        "expiresAfterTurns": 2,
    }


def show_more_context() -> dict[str, Any]:
    return {
        "version": 1,
        "activeExamTarget": "cet6",
        "sourceMessageId": "turn_1:assistant",
        "topicKind": "shape_neighbors",
        "sourceQuery": "给我几个跟 evaluate 易混的单词",
        "focus": None,
        "candidates": [
            {"index": 1, "lemma": "evaluate", "label": "evaluate"},
            {"index": 2, "lemma": "evacuate", "label": "evacuate"},
        ],
        "continuationCandidates": [
            {"index": 1, "lemma": "escalate", "label": "escalate"},
            {"index": 2, "lemma": "graduate", "label": "graduate"},
        ],
        "availableActions": [
            "collect_one",
            "switch_scope",
            "study_guidance",
            "collect_group",
            "show_more",
        ],
        "expiresAfterTurns": 2,
    }


@dataclass(frozen=True)
class Case:
    case_id: str
    category: str
    query: str
    context: dict[str, Any] | None = None
    expected_query_mode: str | None = None
    expected_resolution: str | None = None
    expected_terms: list[str] | None = None
    expected_answer_kind: str | None = None
    expected_answer_style: str | None = None
    expected_main_first: str | None = None
    expected_main_contains: list[str] = field(default_factory=list)
    forbid_main_contains: list[str] = field(default_factory=list)
    expected_action: str | None = None
    expected_target_lemmas: list[str] | None = None
    forbid_query_mode: str | None = None


CASES = [
    Case(
        case_id="stable_exact_lookup",
        category="stable",
        query="access 是什么意思",
        expected_query_mode="fuzzy_recall",
        expected_resolution="resolved",
        expected_main_contains=["access"],
    ),
    Case(
        case_id="stable_direct_compare",
        category="stable",
        query="access assess 怎么区分",
        expected_query_mode="direct_compare",
        expected_resolution="resolved",
        expected_main_contains=["access", "assess"],
    ),
    Case(
        case_id="stable_show_more",
        category="stable",
        query="还有吗",
        context=show_more_context(),
        expected_action="show_more",
        expected_target_lemmas=["escalate", "graduate"],
    ),
    Case(
        case_id="stable_random_no_match",
        category="stable",
        query="zzqvwm 是什么意思",
        expected_resolution="no_match",
    ),
    Case(
        case_id="stable_root_re_con",
        category="stable",
        query="re+con 的词根有什么词",
        expected_query_mode="root_family_summary",
        expected_resolution="resolved",
        expected_main_contains=["reconcile"],
    ),
    Case(
        case_id="stable_form_filter",
        category="stable",
        query="re开头cile结尾的单词",
        expected_query_mode="root_family_summary",
        expected_resolution="resolved",
        expected_main_contains=["reconcile"],
    ),
    Case(
        case_id="affix_anti_form_inventory",
        category="expected_improvement",
        query="anti开头的词有哪些",
        expected_query_mode="root_family_summary",
        expected_resolution="resolved",
        expected_main_contains=["antique", "anticipate"],
    ),
    Case(
        case_id="affix_anti_against_semantic_filter",
        category="expected_improvement",
        query="anti开头表示反对的词",
        expected_query_mode="root_family_summary",
        expected_resolution="resolved",
        expected_main_contains=["antibody"],
        forbid_main_contains=["antique", "anticipate"],
    ),
    Case(
        case_id="affix_literal_anti_against_semantic_filter",
        category="expected_improvement",
        query="anti表示反对的词",
        expected_query_mode="root_family_summary",
        expected_resolution="resolved",
        expected_main_contains=["antibody"],
        forbid_main_contains=["antique", "anticipate"],
    ),
    Case(
        case_id="affix_re_again_semantic_filter",
        category="expected_improvement",
        query="re开头表示再次的词",
        expected_query_mode="root_family_summary",
        expected_resolution="resolved",
        expected_main_contains=["recover"],
        forbid_main_contains=["reconcile"],
    ),
    Case(
        case_id="affix_less_without_semantic_filter",
        category="expected_improvement",
        query="less结尾表示没有的词",
        expected_query_mode="root_family_summary",
        expected_resolution="resolved",
        expected_main_contains=["useless"],
        forbid_main_contains=["unless"],
    ),
    Case(
        case_id="affix_literal_less_without_semantic_filter",
        category="expected_improvement",
        query="-less表示没有的词",
        expected_query_mode="root_family_summary",
        expected_resolution="resolved",
        expected_main_contains=["useless"],
        forbid_main_contains=["unless"],
    ),
    Case(
        case_id="affix_er_person_semantic_filter",
        category="expected_improvement",
        query="er结尾表示人的词",
        expected_query_mode="root_family_summary",
        expected_resolution="resolved",
        expected_main_contains=["banker"],
        forbid_main_contains=["administer", "better", "water"],
    ),
    Case(
        case_id="affix_literal_er_person_semantic_filter",
        category="expected_improvement",
        query="-er表示人的词",
        expected_query_mode="root_family_summary",
        expected_resolution="resolved",
        expected_main_contains=["banker"],
        forbid_main_contains=["administer", "better", "water"],
    ),
    Case(
        case_id="affix_xyz_exact_prefix_no_match",
        category="expected_improvement",
        query="xyz开头的单词",
        expected_query_mode="root_family_summary",
        expected_resolution="no_match",
    ),
    Case(
        case_id="stable_context_choice",
        category="stable",
        query="哪个更自然",
        context=follow_context(),
        expected_action="context_choice",
        expected_target_lemmas=["follow", "obey", "comply"],
    ),
    Case(
        case_id="stable_meaning_limit_cn",
        category="stable",
        query="限制的英文是什么",
        expected_query_mode="meaning_lookup",
        expected_resolution="resolved",
        expected_answer_kind="grounded",
        expected_main_contains=["restrict"],
    ),
    Case(
        case_id="boundary_formal_word_lookup",
        category="regression_probe",
        query="formal 是什么意思",
        expected_resolution="resolved",
        expected_main_contains=["formal"],
        forbid_query_mode="semantic_expression",
    ),
    Case(
        case_id="meaning_expression_cn",
        category="expected_improvement",
        query="表达观点的英文是什么",
        expected_query_mode="meaning_lookup",
        expected_resolution="resolved",
        forbid_main_contains=["hiss"],
    ),
    Case(
        case_id="meaning_obey_cn",
        category="expected_improvement",
        query="遵循的英文是什么",
        expected_query_mode="meaning_lookup",
        expected_resolution="resolved",
        forbid_main_contains=["disobedience", "subdue", "unwilling"],
    ),
    Case(
        case_id="meaning_rule_phrase_cn",
        category="expected_improvement",
        query="遵守规则用英文怎么说",
        expected_query_mode="meaning_lookup",
        expected_resolution="resolved",
        expected_answer_kind="grounded",
        expected_main_contains=["follow"],
        forbid_main_contains=["defer"],
    ),
    Case(
        case_id="meaning_activity_scope_closure_cn",
        category="expected_improvement",
        query="活动的英文是什么",
        expected_query_mode="meaning_lookup",
        expected_resolution="resolved",
        expected_answer_kind="grounded",
        expected_main_first="activity",
        expected_main_contains=["activity"],
    ),
    Case(
        case_id="meaning_responsible_cn",
        category="expected_improvement",
        query="负责的英文是什么",
        expected_query_mode="meaning_lookup",
        expected_resolution="resolved",
        expected_answer_kind="grounded",
        expected_main_contains=["responsible"],
        forbid_main_contains=["respond"],
    ),
    Case(
        case_id="meaning_take_responsibility_cn",
        category="expected_improvement",
        query="承担责任的英文是什么",
        expected_query_mode="meaning_lookup",
        expected_resolution="resolved",
        expected_answer_kind="grounded",
        expected_main_contains=["responsible"],
        forbid_main_contains=["respond"],
    ),
    Case(
        case_id="meaning_express_idea_cn",
        category="expected_improvement",
        query="表达想法的英文是什么",
        expected_query_mode="meaning_lookup",
        expected_resolution="resolved",
        expected_answer_kind="grounded",
        expected_main_contains=["express"],
        forbid_main_contains=["thought", "notion"],
    ),
    Case(
        case_id="meaning_state_view_cn",
        category="expected_improvement",
        query="提出观点的英文是什么",
        expected_query_mode="meaning_lookup",
        expected_resolution="resolved",
        expected_answer_kind="grounded",
        expected_main_contains=["state"],
        forbid_main_contains=["thought", "notion"],
    ),
    Case(
        case_id="stable_direct_compare_restrain_constrain",
        category="stable",
        query="restrain 和 constrain 的区别",
        expected_query_mode="direct_compare",
        expected_resolution="resolved",
        expected_main_contains=["restrain", "constrain"],
    ),
    Case(
        case_id="stable_direct_compare_desert_dessert",
        category="stable",
        query="desert dessert 怎么区分",
        expected_query_mode="direct_compare",
        expected_resolution="resolved",
        expected_main_contains=["desert", "dessert"],
    ),
    Case(
        case_id="stable_shape_contest",
        category="stable",
        query="和 contest 像的单词",
        expected_query_mode="shape_neighbor_search",
        expected_resolution="resolved",
        expected_main_contains=["contest", "congest"],
    ),
    Case(
        case_id="stable_phrase_according_to",
        category="stable",
        query="according to 是什么意思",
        expected_resolution="resolved",
        expected_main_contains=["accordingto"],
    ),
    Case(
        case_id="semantic_natural_en",
        category="regression_probe",
        query="more natural way to say get",
        expected_query_mode="semantic_expression",
        expected_terms=["get"],
    ),
    Case(
        case_id="semantic_formal_en",
        category="expected_improvement",
        query="more formal way to say follow",
        expected_query_mode="semantic_expression",
        expected_terms=["follow"],
    ),
    Case(
        case_id="semantic_another_way_en",
        category="expected_improvement",
        query="another way to say help",
        expected_query_mode="semantic_expression",
        expected_terms=["help"],
    ),
    Case(
        case_id="semantic_synonym_cn",
        category="expected_improvement",
        query="active 的近义词",
        expected_query_mode="semantic_expression",
        expected_terms=["active"],
    ),
    Case(
        case_id="semantic_responsible_cn",
        category="expected_improvement",
        query="responsible 的同义词",
        expected_query_mode="semantic_expression",
        expected_terms=["responsible"],
    ),
    Case(
        case_id="semantic_keep_similar_cn",
        category="expected_improvement",
        query="有没有和 keep 差不多意思的词",
        expected_query_mode="semantic_expression",
        expected_terms=["keep"],
    ),
    Case(
        case_id="semantic_good_essay_cn",
        category="expected_improvement",
        query="用作文更正式地表达 good",
        expected_query_mode="semantic_expression",
        expected_terms=["good"],
    ),
    Case(
        case_id="root_anti_dis_gate",
        category="expected_improvement",
        query="anti+dis 的词根有什么词",
        expected_query_mode="root_family_summary",
        expected_resolution="no_match",
    ),
    Case(
        case_id="root_pre_sub_gate",
        category="expected_improvement",
        query="pre+sub 的词根有什么词",
        expected_query_mode="root_family_summary",
        expected_resolution="no_match",
    ),
    Case(
        case_id="root_anti_xyz_gate",
        category="expected_improvement",
        query="anti+xyz 的词根有什么词",
        expected_query_mode="root_family_summary",
        expected_resolution="no_match",
    ),
    Case(
        case_id="root_re_con_sub_gate",
        category="expected_improvement",
        query="re+con+sub 的词根有什么词",
        expected_query_mode="root_family_summary",
        expected_resolution="no_match",
    ),
    Case(
        case_id="root_random_derivative_gate",
        category="expected_improvement",
        query="xqz 的派生词",
        expected_query_mode="root_family_summary",
        expected_resolution="no_match",
    ),
    Case(
        case_id="style_followup_essay",
        category="expected_improvement",
        query="还有更适合作文的吗",
        context=follow_context(),
        expected_action="context_choice",
        expected_target_lemmas=["follow", "obey", "comply"],
    ),
    Case(
        case_id="style_followup_formal",
        category="expected_improvement",
        query="有没有更正式的",
        context=follow_context(),
        expected_action="context_choice",
        expected_target_lemmas=["follow", "obey", "comply"],
    ),
    Case(
        case_id="style_followup_spoken",
        category="expected_improvement",
        query="还有更口语的吗",
        context=follow_context(),
        expected_action="context_choice",
        expected_target_lemmas=["follow", "obey", "comply"],
    ),
    Case(
        case_id="style_followup_no_context",
        category="expected_improvement",
        query="还有更正式的吗",
        expected_action="clarification",
        expected_target_lemmas=[],
    ),
]


def reserve_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
        server.bind(("127.0.0.1", 0))
        return int(server.getsockname()[1])


def ensure_clean_temp(path: Path) -> None:
    resolved = path.resolve()
    allowed_parent = TEMP_ROOT.resolve().parent
    if allowed_parent not in resolved.parents and resolved != TEMP_ROOT.resolve():
        raise RuntimeError(f"Refusing to clean unexpected path: {resolved}")
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def extract_baseline(ref: str, target_dir: Path) -> None:
    completed = subprocess.run(
        ["git", "archive", "--format=tar", ref],
        cwd=REPO_ROOT,
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    target_dir.mkdir(parents=True, exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(completed.stdout), mode="r:") as archive:
        archive.extractall(target_dir, filter="data")


def request_json(url: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, headers=headers, method="POST" if payload else "GET")
    with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
        return json.loads(response.read().decode("utf-8"))


def wait_for_health(base_url: str, process: subprocess.Popen[Any], log_path: Path) -> None:
    deadline = time.monotonic() + 60
    last_error = ""
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(
                f"Server exited with code {process.returncode}; see {log_path}"
            )
        try:
            request_json(f"{base_url}/health")
            return
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
            last_error = str(error)
            time.sleep(0.25)
    raise RuntimeError(f"Timed out waiting for {base_url}/health: {last_error}; see {log_path}")


def start_server(root: Path, label: str, ecdict_path: Path, logs_dir: Path) -> tuple[subprocess.Popen[Any], str, Path]:
    port = reserve_port()
    base_url = f"http://127.0.0.1:{port}"
    env = os.environ.copy()
    env.update(
        {
            "OPENAI_API_KEY": "",
            "DATABASE_URL": "",
            "ENGGO_USE_STRUCTURED_RUNTIME": "false",
            "ENGGO_ECDICT_PATH": str(ecdict_path),
        }
    )
    log_path = logs_dir / f"{label}.log"
    log_file = log_path.open("w", encoding="utf-8")
    process = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "backend.app.main:create_app",
            "--factory",
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
            "--log-level",
            "warning",
        ],
        cwd=root,
        env=env,
        stdout=log_file,
        stderr=subprocess.STDOUT,
    )
    log_file.close()
    wait_for_health(base_url, process, log_path)
    return process, base_url, log_path


def post_chat(base_url: str, case: Case) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "activeExamTarget": "cet6",
        "query": case.query,
        "history": [],
    }
    if case.context is not None:
        payload["conversationContext"] = case.context
    return request_json(f"{base_url}/api/chat", payload)


def lemmas_from_items(items: Any) -> list[str]:
    if not isinstance(items, list):
        return []
    lemmas: list[str] = []
    for item in items:
        if isinstance(item, dict) and isinstance(item.get("lemma"), str):
            lemmas.append(item["lemma"])
    return lemmas


def observation(payload: dict[str, Any]) -> dict[str, Any]:
    grounding = payload.get("grounding")
    if not isinstance(grounding, dict):
        grounding = {}
    resolved = payload.get("resolvedFollowUp")
    if not isinstance(resolved, dict):
        resolved = {}

    main_lemmas = lemmas_from_items(grounding.get("mainAnswer"))
    comparison = grounding.get("comparisonView")
    if isinstance(comparison, dict):
        main_lemmas.extend(lemmas_from_items(comparison.get("members")))
    root_family = grounding.get("rootFamilyView")
    if isinstance(root_family, dict):
        main_lemmas.extend(lemmas_from_items(root_family.get("members")))
    main_lemmas = list(dict.fromkeys(main_lemmas))

    target_lemmas = lemmas_from_items(resolved.get("targetRefs"))
    return {
        "answerKind": payload.get("answerKind"),
        "queryMode": grounding.get("queryMode"),
        "answerStyle": grounding.get("answerStyle"),
        "resolution": grounding.get("resolution"),
        "terms": grounding.get("terms") if isinstance(grounding.get("terms"), list) else [],
        "style": grounding.get("style"),
        "mainLemmas": main_lemmas,
        "resolvedKind": resolved.get("kind"),
        "action": resolved.get("action") or resolved.get("kind"),
        "targetLemmas": target_lemmas,
        "answerPreview": str(payload.get("answer") or "")[:120],
    }


def check_case(case: Case, obs: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if case.expected_query_mode and obs["queryMode"] != case.expected_query_mode:
        errors.append(f"queryMode expected {case.expected_query_mode}, got {obs['queryMode']}")
    if case.forbid_query_mode and obs["queryMode"] == case.forbid_query_mode:
        errors.append(f"queryMode must not be {case.forbid_query_mode}")
    if case.expected_resolution and obs["resolution"] != case.expected_resolution:
        errors.append(f"resolution expected {case.expected_resolution}, got {obs['resolution']}")
    if case.expected_answer_kind and obs["answerKind"] != case.expected_answer_kind:
        errors.append(f"answerKind expected {case.expected_answer_kind}, got {obs['answerKind']}")
    if case.expected_answer_style and obs["answerStyle"] != case.expected_answer_style:
        errors.append(f"answerStyle expected {case.expected_answer_style}, got {obs['answerStyle']}")
    if case.expected_terms is not None and obs["terms"] != case.expected_terms:
        errors.append(f"terms expected {case.expected_terms}, got {obs['terms']}")
    if case.expected_main_first and (
        not obs["mainLemmas"] or obs["mainLemmas"][0] != case.expected_main_first
    ):
        errors.append(
            f"mainLemmas first expected {case.expected_main_first}, got {obs['mainLemmas']}"
        )
    missing = [lemma for lemma in case.expected_main_contains if lemma not in obs["mainLemmas"]]
    if missing:
        errors.append(f"mainLemmas missing {missing}, got {obs['mainLemmas']}")
    forbidden = [lemma for lemma in case.forbid_main_contains if lemma in obs["mainLemmas"]]
    if forbidden:
        errors.append(f"mainLemmas must not include {forbidden}, got {obs['mainLemmas']}")
    if case.expected_action and obs["action"] != case.expected_action:
        errors.append(f"action expected {case.expected_action}, got {obs['action']}")
    if case.expected_target_lemmas is not None and obs["targetLemmas"] != case.expected_target_lemmas:
        errors.append(f"targetLemmas expected {case.expected_target_lemmas}, got {obs['targetLemmas']}")
    return errors


def run_matrix(baseline_url: str, current_url: str) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    totals: dict[str, Any] = {
        "total": 0,
        "pass": 0,
        "fail": 0,
        "changed": 0,
        "byCategory": {},
    }

    for case in CASES:
        baseline_payload = post_chat(baseline_url, case)
        current_payload = post_chat(current_url, case)
        baseline_obs = observation(baseline_payload)
        current_obs = observation(current_payload)
        errors = check_case(case, current_obs)
        changed = baseline_obs != current_obs
        passed = not errors

        category = totals["byCategory"].setdefault(
            case.category,
            {"total": 0, "pass": 0, "fail": 0, "changed": 0},
        )
        totals["total"] += 1
        category["total"] += 1
        if passed:
            totals["pass"] += 1
            category["pass"] += 1
        else:
            totals["fail"] += 1
            category["fail"] += 1
        if changed:
            totals["changed"] += 1
            category["changed"] += 1

        rows.append(
            {
                "id": case.case_id,
                "category": case.category,
                "query": case.query,
                "pass": passed,
                "changed": changed,
                "errors": errors,
                "baseline": baseline_obs,
                "current": current_obs,
            }
        )

    return rows, totals


def print_report(rows: list[dict[str, Any]], totals: dict[str, Any], baseline_ref: str) -> None:
    print(f"Baseline: {baseline_ref}")
    print(json.dumps(totals, ensure_ascii=False, indent=2))
    print()
    for row in rows:
        marker = "PASS" if row["pass"] else "FAIL"
        changed = "changed" if row["changed"] else "same"
        print(f"[{marker}] {row['category']}::{row['id']} ({changed}) {row['query']}")
        if row["errors"]:
            for error in row["errors"]:
                print(f"  - {error}")
        print(f"  baseline: {json.dumps(row['baseline'], ensure_ascii=False, sort_keys=True)}")
        print(f"  current : {json.dumps(row['current'], ensure_ascii=False, sort_keys=True)}")
    print()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline-ref", default=DEFAULT_BASELINE_REF)
    parser.add_argument("--ecdict-path", type=Path, default=DEFAULT_ECDICT_PATH)
    parser.add_argument("--keep-temp", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    ecdict_path = args.ecdict_path.resolve()
    if not ecdict_path.exists():
        print(f"ECDICT CSV not found: {ecdict_path}", file=sys.stderr)
        return 2

    ensure_clean_temp(TEMP_ROOT)
    baseline_dir = TEMP_ROOT / "baseline"
    logs_dir = TEMP_ROOT / "logs"
    logs_dir.mkdir(parents=True, exist_ok=True)
    extract_baseline(args.baseline_ref, baseline_dir)

    processes: list[subprocess.Popen[Any]] = []
    try:
        baseline_process, baseline_url, baseline_log = start_server(
            baseline_dir,
            "baseline",
            ecdict_path,
            logs_dir,
        )
        current_process, current_url, current_log = start_server(
            REPO_ROOT,
            "current",
            ecdict_path,
            logs_dir,
        )
        processes.extend([baseline_process, current_process])
        rows, totals = run_matrix(baseline_url, current_url)
        print_report(rows, totals, args.baseline_ref)
        if args.keep_temp:
            print(f"Logs: baseline={baseline_log} current={current_log}")
        else:
            print("Temp logs removed. Re-run with --keep-temp to inspect server logs.")
        return 0 if totals["fail"] == 0 else 1
    finally:
        for process in processes:
            if process.poll() is None:
                process.terminate()
        deadline = time.monotonic() + 10
        for process in processes:
            while process.poll() is None and time.monotonic() < deadline:
                time.sleep(0.1)
            if process.poll() is None:
                process.kill()
        if not args.keep_temp:
            ensure_clean_temp(TEMP_ROOT)
            TEMP_ROOT.rmdir()


if __name__ == "__main__":
    raise SystemExit(main())
