from pathlib import Path

from backend.app.content.ecdict import (
    build_ecdict_basic_profile_index,
    create_ecdict_basic_profile_lookup,
    lookup_ecdict_basic_profile,
    parse_ecdict_csv,
)


def fixture_rows():
    return parse_ecdict_csv(
        "\n".join(
            [
                "word,phonetic,definition,translation,pos,collins,oxford,tag,bnc,frq,exchange,detail,audio",
                '"accent",,,"n. 口音；重音",,2,1,zk gk cet4 ky,3701,4140,,,',
                '"make up",,,"v. 组成；编造；化妆；和解",,1,,cet4,1000,2000,,,',
                '"according to",,,"prep. 根据；按照",,1,,cet4,1000,2000,,,',
                '"app",,,"[计] 应用程序",,1,,cet4,1000,2000,,,',
            ],
        ),
    )


def test_lookup_ecdict_basic_profile_cleans_domain_only_noise():
    index = build_ecdict_basic_profile_index(fixture_rows())

    assert lookup_ecdict_basic_profile(index, "app") is None


def test_lookup_ecdict_basic_profile_resolves_words_and_joined_phrase_aliases():
    index = build_ecdict_basic_profile_index(fixture_rows())

    assert lookup_ecdict_basic_profile(index, "accent").canonical == "accent"
    phrase = lookup_ecdict_basic_profile(index, "accordingto")

    assert phrase is not None
    assert phrase.canonical == "according to"
    assert phrase.lookup_key == "accordingto"
    assert phrase.match_kind == "joined_phrase_alias"
    assert phrase.meanings == ["prep. 根据；按照"]


def test_create_ecdict_basic_profile_lookup_returns_none_when_file_missing(tmp_path):
    lookup = create_ecdict_basic_profile_lookup(dictionary_path=tmp_path / "missing.csv")

    assert lookup("accent") is None


def test_create_ecdict_basic_profile_lookup_loads_file_lazily(tmp_path):
    dictionary_path = Path(tmp_path / "ecdict.csv")
    dictionary_path.write_text(
        "\n".join(
            [
                "word,phonetic,definition,translation,pos,collins,oxford,tag,bnc,frq,exchange,detail,audio",
                '"make up",,,"v. 组成；编造；化妆；和解",,1,,cet4,1000,2000,,,',
            ],
        ),
        encoding="utf-8",
    )
    lookup = create_ecdict_basic_profile_lookup(dictionary_path=dictionary_path)

    profile = lookup("make up")

    assert profile is not None
    assert profile.canonical == "make up"
    assert profile.entry_kind == "phrase"
    assert profile.meanings == ["v. 组成；编造；化妆；和解"]
