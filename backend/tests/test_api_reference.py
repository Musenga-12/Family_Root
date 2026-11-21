"""docs/API.md is generated from the routes (scripts/api_reference.py) and must match them."""
import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]


def test_the_api_reference_is_up_to_date():
    r = subprocess.run([sys.executable, "scripts/api_reference.py", "--check"], cwd=BACKEND, capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr
