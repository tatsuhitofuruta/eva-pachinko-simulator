"""Smoke-check the static simulator page without requiring a browser."""

from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parents[1]
INDEX_HTML = ROOT / "index.html"

REQUIRED_IDS = {
    "machine",
    "totalSpins",
    "rotation1k",
    "speed",
    "startBtn",
    "rotationDisplay",
    "ballsDisplay",
    "investDisplay",
    "profitDisplay",
    "stateDisplay",
    "log",
    "cumSessions",
    "cumInvest",
    "cumPayout",
    "cumProfit",
    "calendarGrid",
    "finalResult",
}

REQUIRED_FUNCTIONS = {
    "startSimulation",
    "getHesoResult",
    "getDenchuPayout",
    "updateDisplay",
    "setState",
    "addSessionResult",
    "renderCalendar",
}

REQUIRED_MACHINE_KEYS = {
    "eva15",
    "eva17",
    "garo",
    "garo12",
    "ghoul",
}


class StaticPageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: set[str] = set()
        self.onclick_handlers: list[str] = []
        self.script_blocks: list[str] = []
        self.title_chunks: list[str] = []
        self._in_script = False
        self._in_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr_map = dict(attrs)
        element_id = attr_map.get("id")
        if element_id:
            self.ids.add(element_id)

        onclick = attr_map.get("onclick")
        if onclick:
            self.onclick_handlers.append(onclick)

        if tag == "script":
            self._in_script = True
        elif tag == "title":
            self._in_title = True

    def handle_endtag(self, tag: str) -> None:
        if tag == "script":
            self._in_script = False
        elif tag == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        if self._in_script:
            self.script_blocks.append(data)
        elif self._in_title:
            self.title_chunks.append(data)


def find_missing_functions(script_text: str, function_names: set[str]) -> set[str]:
    missing: set[str] = set()
    for name in function_names:
        patterns = [
            rf"\bfunction\s+{re.escape(name)}\s*\(",
            rf"\bconst\s+{re.escape(name)}\s*=",
            rf"\blet\s+{re.escape(name)}\s*=",
        ]
        if not any(re.search(pattern, script_text) for pattern in patterns):
            missing.add(name)
    return missing


def main() -> int:
    if not INDEX_HTML.exists():
        print(f"Missing {INDEX_HTML}", file=sys.stderr)
        return 1

    html = INDEX_HTML.read_text(encoding="utf-8")
    parser = StaticPageParser()
    parser.feed(html)

    errors: list[str] = []

    if "<!DOCTYPE html>" not in html[:100]:
        errors.append("index.html should start with an HTML5 doctype")

    title = "".join(parser.title_chunks).strip()
    if not title:
        errors.append("index.html is missing a <title>")

    missing_ids = REQUIRED_IDS - parser.ids
    if missing_ids:
        errors.append(f"Missing required element ids: {', '.join(sorted(missing_ids))}")

    script_text = "\n".join(parser.script_blocks)
    missing_functions = find_missing_functions(script_text, REQUIRED_FUNCTIONS)
    if missing_functions:
        errors.append(f"Missing required JS functions: {', '.join(sorted(missing_functions))}")

    handler_functions = {
        match.group(1)
        for handler in parser.onclick_handlers
        for match in re.finditer(r"\b([A-Za-z_$][\w$]*)\s*\(", handler)
    }
    missing_handler_functions = find_missing_functions(script_text, handler_functions)
    if missing_handler_functions:
        errors.append(
            "Missing JS functions referenced by onclick handlers: "
            + ", ".join(sorted(missing_handler_functions))
        )

    missing_machine_keys = {
        key for key in REQUIRED_MACHINE_KEYS if not re.search(rf"\b{re.escape(key)}\s*:", script_text)
    }
    if missing_machine_keys:
        errors.append(f"Missing machine definitions: {', '.join(sorted(missing_machine_keys))}")

    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1

    print(f"Validated {INDEX_HTML.name}: title={title!r}, ids={len(parser.ids)}, handlers={len(handler_functions)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
