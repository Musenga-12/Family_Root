"""End-to-end check of the React app's family-server sync (src/test/sync.live.test.jsx) against this backend.

Starts the API on a throwaway copy of the sample family (a temporary SQLite file and upload folder, deleted afterwards;
backend/.env and its database are never used), runs the live test with Vitest, then stops. Run from backend/:

    .venv\\Scripts\\python scripts/live_sync_check.py
"""
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent
TMP = Path(tempfile.mkdtemp(prefix="familyroots-live-"))
PORT = 8765
API = f"http://127.0.0.1:{PORT}/api/v1"

os.environ.update(
    ENVIRONMENT="development",
    DATABASE_URL=f"sqlite:///{(TMP / 'live.db').as_posix()}",
    DATABASE_URL_DIRECT="",  # never a migration address from backend/.env
    UPLOAD_DIR=str(TMP / "uploads"),
    SECRET_KEY="live-check-only-" + "k" * 40,
    FRONTEND_ORIGIN="http://localhost:5173",
    API_BASE_URL=f"http://127.0.0.1:{PORT}",
    RATE_LIMIT_ENABLED="false",
)
os.chdir(BACKEND)
sys.path.insert(0, str(BACKEND))

import uvicorn  # noqa: E402

import seed  # noqa: E402
from app.config import settings  # noqa: E402

assert settings.database_url.endswith("live.db"), "the live check must never use the real database"


def main() -> int:
    seed.main()
    server = uvicorn.Server(uvicorn.Config("app.main:app", host="127.0.0.1", port=PORT, log_level="warning"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    for _ in range(100):
        try:
            urllib.request.urlopen(f"{API}/invites/by-token/none", timeout=1)
        except urllib.error.HTTPError:
            break  # answering (404): ready
        except OSError:
            time.sleep(0.1)
    env = {**os.environ, "FR_LIVE_API": API, "VITE_API_URL": API}
    npx = "npx.cmd" if os.name == "nt" else "npx"
    try:
        return subprocess.run([npx, "vitest", "run", *(sys.argv[1:] or ["src/test/sync.live.test.jsx"])], cwd=ROOT, env=env, timeout=300).returncode
    finally:
        server.should_exit = True
        thread.join(timeout=10)
        shutil.rmtree(TMP, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
