from pathlib import Path

from backend.app.answering.advanced_lookup import load_curated_seed_content


def test_curated_seed_content_includes_migrated_root_groups():
    base_dir = Path(__file__).resolve().parents[2] / "data" / "exam-vocab"

    _candidates, groups = load_curated_seed_content(str(base_dir))
    group_by_id = {group.id: group for group in groups}

    assert [
        member.candidate.lemma
        for member in group_by_id["root-stitute"].members
    ] == ["institute", "institution", "constitute", "substitute"]
    assert [
        member.candidate.lemma
        for member in group_by_id["root-tempt"].members
    ] == ["attempt", "tempt", "temptation", "contempt"]
