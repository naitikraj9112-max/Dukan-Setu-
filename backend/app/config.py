from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parents[2]
ROOT_ENV_FILE = PROJECT_ROOT / ".env"


@dataclass(frozen=True)
class Settings:
    supabase_url: str
    supabase_anon_key: str
    cors_origins: tuple[str, ...] = ()
    log_level: str = "INFO"

    @classmethod
    def from_env(cls) -> "Settings":
        # Resolve from this module, not the current working directory, so CLI and
        # IDE launches load the same root project configuration.
        load_dotenv(dotenv_path=ROOT_ENV_FILE, override=False)
        url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
        anon_key = os.getenv("SUPABASE_ANON_KEY", "").strip()
        if not url:
            raise RuntimeError("SUPABASE_URL is required")
        if not anon_key:
            raise RuntimeError("SUPABASE_ANON_KEY is required")
        parsed = urlparse(url)
        local_http = parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1", "::1"}
        if (parsed.scheme != "https" and not local_http) or not parsed.netloc:
            raise RuntimeError("SUPABASE_URL must use https (http is allowed for localhost)")
        origins = tuple(
            item.strip().rstrip("/")
            for item in os.getenv("CORS_ORIGINS", "").split(",")
            if item.strip()
        )
        for origin in origins:
            parsed_origin = urlparse(origin)
            if parsed_origin.scheme not in {"http", "https"} or not parsed_origin.netloc:
                raise RuntimeError("CORS_ORIGINS must contain valid http(s) origins")
        log_level = os.getenv("LOG_LEVEL", "INFO").strip().upper()
        if log_level not in {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}:
            raise RuntimeError("LOG_LEVEL is invalid")
        return cls(url, anon_key, origins, log_level)
