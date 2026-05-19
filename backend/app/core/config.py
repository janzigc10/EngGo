from dataclasses import dataclass
import os
from pathlib import Path

from dotenv import load_dotenv


def parse_bool(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    app_name: str = "enggo-fastapi"
    environment: str = "development"
    database_url: str | None = None
    use_structured_runtime: bool = False
    openai_api_key: str | None = None
    openai_base_url: str | None = None
    openai_model: str | None = None
    source_lemma_base_dir: Path = Path.cwd() / "data" / "exam-vocab"
    ecdict_dictionary_path: Path = (
        Path.cwd() / "output" / "external-dictionaries" / "ecdict.csv"
    )


def load_settings(env_file: Path | str | None = None) -> Settings:
    load_dotenv(
        dotenv_path=env_file or Path.cwd() / ".env",
        override=False,
        encoding="utf-8-sig",
    )

    return Settings(
        environment=os.getenv("ENGGO_BACKEND_ENV", "development"),
        database_url=os.getenv("DATABASE_URL"),
        use_structured_runtime=parse_bool(os.getenv("ENGGO_USE_STRUCTURED_RUNTIME")),
        openai_api_key=os.getenv("OPENAI_API_KEY"),
        openai_base_url=os.getenv("OPENAI_BASE_URL"),
        openai_model=os.getenv("OPENAI_MODEL"),
        source_lemma_base_dir=Path(
            os.getenv("ENGGO_SOURCE_LEMMA_BASE_DIR", str(Settings.source_lemma_base_dir)),
        ),
        ecdict_dictionary_path=Path(
            os.getenv("ENGGO_ECDICT_PATH", str(Settings.ecdict_dictionary_path)),
        ),
    )
