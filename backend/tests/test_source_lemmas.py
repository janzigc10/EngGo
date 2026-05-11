from pathlib import Path

from backend.app.content.source_lemmas import (
    find_source_lemma_memberships_for_lookup,
    load_source_lemma_memberships,
)


def create_source_lemma_fixture(base_dir: Path):
    source_dir = base_dir / "source-lemmas"
    source_dir.mkdir(parents=True)
    (source_dir / "gaokao-2020-lemmas.txt").write_text(
        "Accent\nache\n",
        encoding="utf-8",
    )
    (source_dir / "cet-2016-lemmas.tsv").write_text(
        "\n".join(
            [
                "lemma\tsourceScope",
                "accent\tcet4",
                "detach\tcet6-extra",
                "accordingto\tcet4",
            ],
        ),
        encoding="utf-8",
    )


def test_loads_source_lemma_memberships_with_cet4_counted_for_cet6(tmp_path):
    create_source_lemma_fixture(tmp_path)

    memberships = load_source_lemma_memberships(base_dir=tmp_path)

    assert {
        (membership.lemma, membership.scope_code, membership.source_scope)
        for membership in memberships
    } >= {
        ("accent", "gaokao", "gaokao"),
        ("accent", "cet4", "cet4"),
        ("accent", "cet6", "cet4"),
        ("detach", "cet6", "cet6-extra"),
    }
    assert not any(membership.scope_code == "postgrad" for membership in memberships)


def test_find_source_lemma_memberships_resolves_explicit_phrase_alias(tmp_path):
    create_source_lemma_fixture(tmp_path)

    memberships = find_source_lemma_memberships_for_lookup(
        "according to",
        base_dir=tmp_path,
    )

    assert [membership.lemma for membership in memberships] == ["accordingto", "accordingto"]
    assert {membership.scope_code for membership in memberships} == {"cet4", "cet6"}
