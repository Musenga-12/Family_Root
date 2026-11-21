"""Every API call in the React app (src/, through api() in src/lib/api.js) goes to a route that exists, with that method.
The calls are read from the source: a literal or template path (a `${cond ? "a" : "b"}` part counts as both "a" and
"b"), and the method (each `method:` written in the call, otherwise POST with a body or form, GET without)."""
import re
from itertools import product
from pathlib import Path

from app.config import API_PREFIX
from app.main import app

SRC = Path(__file__).resolve().parents[2] / "src"
START = re.compile(r"""\bapi\(\s*(?=["'`]/)""")
COMMENTS = re.compile(r"/\*.*?\*/|^\s*//.*?$", re.S | re.M)
TERNARY = re.compile(r"""^[^?]*\?\s*["']([^"']*)["']\s*:\s*["']([^"']*)["']\s*$""")


def routes() -> list[tuple[str, re.Pattern]]:
    out = []

    def walk(rs):
        for r in rs:
            if getattr(r, "original_router", None) is not None:
                walk(r.original_router.routes)
            elif hasattr(r, "methods") and r.path.startswith("/"):
                path = r.path.removeprefix(API_PREFIX)
                out.extend((m, re.compile("^" + re.sub(r"\{[^}]+\}", "[^/]+", path) + "$")) for m in r.methods)
    walk(app.routes)
    return out


def string_end(text: str, i: int) -> int:
    """text[i] opens a string literal; the index just after it closes (template ${…} parts may hold strings)."""
    quote, i = text[i], i + 1
    while text[i] != quote:
        if text[i] == "\\":
            i += 2
            continue
        if quote == "`" and text.startswith("${", i):
            depth, i = 1, i + 2
            while depth:
                if text[i] in "\"'`":
                    i = string_end(text, i)
                    continue
                depth += {"{": 1, "}": -1}.get(text[i], 0)
                i += 1
            continue
        i += 1
    return i + 1


def call_end(text: str, i: int) -> int:
    """i is just after "api("; the index of its closing parenthesis."""
    depth = 1
    while True:
        if text[i] in "\"'`":
            i = string_end(text, i)
            continue
        depth += {"(": 1, ")": -1}.get(text[i], 0)
        if depth == 0:
            return i
        i += 1


def path_variants(literal: str) -> list[str]:
    """`/x/${a ? "verify" : "reopen"}/${id}` -> ["/x/verify/X", "/x/reopen/X"] (query strings dropped)."""
    parts, options, i = [], [], 0
    for m in re.finditer(r"\$\{", literal):
        if m.start() < i:
            continue
        depth, j = 1, m.end()  # find the matching }
        while depth:
            depth += {"{": 1, "}": -1}.get(literal[j], 0)
            j += 1
        parts.append(literal[i:m.start()])
        inner = literal[m.end():j - 1]
        t = TERNARY.match(inner)
        options.append(list(t.groups()) if t else ["X"])
        i = j
    tail = literal[i:]
    out = []
    for choice in product(*options):
        s = "".join(p + c for p, c in zip(parts, choice, strict=True)) + tail
        out.append(s.split("?")[0])
    return out


def calls() -> list[tuple[str, str, str]]:
    """(file:line, method, path) for every api() call with a written path, one per path and method it can use."""
    found = []
    for f in [*SRC.rglob("*.js"), *SRC.rglob("*.jsx")]:
        if "test" in f.parts:
            continue
        text = COMMENTS.sub(lambda m: "\n" * m.group(0).count("\n"), f.read_text(encoding="utf-8"))
        for m in START.finditer(text):
            p_end = string_end(text, m.end())
            literal = text[m.end() + 1:p_end - 1]
            opts = text[p_end:call_end(text, p_end)]
            methods = re.findall(r"""method:\s*["'](\w+)["']""", opts)
            if not methods or re.search(r"\?\s*\{(?![^}]*method)", opts):  # a branch without its own method
                methods.append("POST" if re.search(r"\b(body|form)\b", opts) else "GET")
            line = text[:m.start()].count("\n") + 1
            for path in path_variants(literal):
                for verb in dict.fromkeys(methods):
                    found.append((f"{f.relative_to(SRC.parent)}:{line}", verb, path))
    return found


def occurrences() -> set[str]:
    """file:line of every api("/…") written in src/ (outside comments), whether or not calls() could read it."""
    out = set()
    for f in [*SRC.rglob("*.js"), *SRC.rglob("*.jsx")]:
        if "test" in f.parts:
            continue
        text = COMMENTS.sub(lambda m: "\n" * m.group(0).count("\n"), f.read_text(encoding="utf-8"))
        out |= {f"{f.relative_to(SRC.parent)}:{text[:m.start()].count(chr(10)) + 1}" for m in START.finditer(text)}
    return out


def test_every_api_call_in_the_app_is_read():
    read = {where for where, _, _ in calls()}
    assert len(read) > 60 and read == occurrences()


def test_every_api_call_in_the_app_has_a_matching_route():
    known = routes()
    missing = [f"{where}: {verb} {path}" for where, verb, path in calls()
               if not any(verb == m and pattern.match(path) for m, pattern in known)]
    assert missing == [], "The app calls routes the API doesn't have:\n" + "\n".join(missing)


def test_the_reader_understands_dynamic_calls():
    assert path_variants('/people/${c.id(b.id)}/${b.pending ? "reopen" : "verify"}') == ["/people/X/reopen", "/people/X/verify"]
    assert path_variants("/reset-password/status?token=${encodeURIComponent(t)}") == ["/reset-password/status"]
