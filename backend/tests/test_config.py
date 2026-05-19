from pathlib import Path

from backend.app.core.config import load_settings


def test_load_settings_reads_database_url_from_env_file(tmp_path, monkeypatch):
    env_file = tmp_path / ".env"
    env_file.write_text(
        "\n".join(
            [
                "DATABASE_URL=postgresql://enggo:secret@localhost:5432/enggo_test",
                "OPENAI_API_KEY=sk-test",
                "OPENAI_BASE_URL=https://example.test/v1",
                "OPENAI_MODEL=model-test",
            ],
        ),
        encoding="utf-8",
    )
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_BASE_URL", raising=False)
    monkeypatch.delenv("OPENAI_MODEL", raising=False)
    monkeypatch.delenv("ENGGO_USE_STRUCTURED_RUNTIME", raising=False)

    settings = load_settings(env_file=env_file)

    assert settings.database_url == "postgresql://enggo:secret@localhost:5432/enggo_test"
    assert settings.openai_api_key == "sk-test"
    assert settings.openai_base_url == "https://example.test/v1"
    assert settings.openai_model == "model-test"
    assert settings.use_structured_runtime is False


def test_load_settings_reads_explicit_structured_runtime_flag(tmp_path, monkeypatch):
    env_file = tmp_path / ".env"
    env_file.write_text(
        "\n".join(
            [
                "DATABASE_URL=postgresql://enggo:secret@localhost:5432/enggo_test",
                "ENGGO_USE_STRUCTURED_RUNTIME=1",
            ],
        ),
        encoding="utf-8",
    )
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("ENGGO_USE_STRUCTURED_RUNTIME", raising=False)

    settings = load_settings(env_file=env_file)

    assert settings.database_url == "postgresql://enggo:secret@localhost:5432/enggo_test"
    assert settings.use_structured_runtime is True


def test_load_settings_exposes_default_project_paths():
    settings = load_settings()

    assert settings.source_lemma_base_dir == Path.cwd() / "data" / "exam-vocab"
    assert settings.ecdict_dictionary_path == (
        Path.cwd() / "output" / "external-dictionaries" / "ecdict.csv"
    )
