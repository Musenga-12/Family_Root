"""render.yaml (the Render Blueprint for this API) stays in step with the code: real setting names, no secret values,
the tested Python version, and a start command the installed uvicorn accepts without trusting forwarded headers."""
import shlex
from pathlib import Path

import pytest
import yaml

from app.config import Settings

BACKEND = Path(__file__).resolve().parents[1]
BLUEPRINT = yaml.safe_load((BACKEND.parent / "render.yaml").read_text(encoding="utf-8"))
[API] = BLUEPRINT["services"]
ENV = {v["key"]: v for v in API["envVars"]}
SECRETS = {"SECRET_KEY", "DATABASE_URL", "DATABASE_URL_DIRECT", "SUPABASE_SERVICE_KEY", "RESEND_API_KEY", "SMTP_PASSWORD"}


def test_the_service_builds_from_backend_with_the_pinned_dependencies():
    assert API["type"] == "web" and API["runtime"] == "python" and API["rootDir"] == "backend"
    assert "-r requirements.txt -c constraints.txt" in API["buildCommand"]
    assert API["healthCheckPath"] == "/health"
    assert API["numInstances"] == 1  # chat and attempt limits live in memory


def test_every_variable_is_a_real_setting_and_production_ones_are_there():
    fields = {name.upper() for name in Settings.model_fields}
    assert set(ENV) - {"PYTHON_VERSION"} <= fields
    assert {"ENVIRONMENT", "SECRET_KEY", "DATABASE_URL", "FRONTEND_ORIGIN", "API_BASE_URL", "TRUSTED_PROXY_HOPS",
            "STORAGE", "SUPABASE_URL", "SUPABASE_SERVICE_KEY", "SUPABASE_BUCKET"} <= set(ENV)
    assert ENV["ENVIRONMENT"]["value"] == "production" and ENV["STORAGE"]["value"] == "supabase"


def test_no_secret_value_is_written_in_the_blueprint():
    for key in SECRETS & set(ENV):
        assert "value" not in ENV[key], key
        assert ENV[key].get("sync") is False or ENV[key].get("generateValue") is True, key
    assert ENV["SECRET_KEY"].get("generateValue") is True


def test_the_python_version_is_the_tested_one():
    tested = (BACKEND / ".python-version").read_text().strip()  # e.g. "3.12"
    full = ENV["PYTHON_VERSION"]["value"]
    assert full.count(".") == 2, "Render needs a full version, e.g. 3.12.11"
    assert full.startswith(tested + ".")


def test_the_start_command_is_accepted_by_uvicorn_and_never_trusts_forwarded_headers():
    from uvicorn.main import main as uvicorn_cli

    args = shlex.split(API["startCommand"].replace("$PORT", "10000"))
    assert args[:2] == ["uvicorn", "app.main:app"]
    ctx = uvicorn_cli.make_context("uvicorn", args[1:])  # raises on an option this uvicorn doesn't know
    assert ctx.params["proxy_headers"] is False
    assert ctx.params["forwarded_allow_ips"] is None
    assert ctx.params["workers"] is None and ctx.params["host"] == "0.0.0.0" and ctx.params["port"] == 10000


@pytest.mark.parametrize("forbidden", ["--forwarded-allow-ips", "--proxy-headers ", "--workers", "--reload"])
def test_the_start_command_has_no_unsafe_options(forbidden):
    assert forbidden not in API["startCommand"] + " "
