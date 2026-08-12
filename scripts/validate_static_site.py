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
    "operatingCapital",
    "workers",
    "dailyWage",
    "exchangeBalls",
    "assumedHeldRatio",
    "replayLimit",
    "managementSummary",
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
    "profitChart",
    "profitChartPanel",
    "finalResult",
    "finalWage",
    "finalOperatingProfit",
    "finalActualHeldRatio",
    "finalCapital",
    "finalEndReason",
    "globalRankingDialog",
    "globalRankingHeadingLabel",
    "globalRankingMachine",
    "globalRankingMetricHeader",
    "globalRankingNote",
    "globalRankingRows",
    "globalRankingNickname",
    "globalRankingSubmitBtn",
}

REQUIRED_FUNCTIONS = {
    "startSimulation",
    "drawNormalOutcome",
    "getVirtualDateString",
    "getHesoResult",
    "getDenchuPayout",
    "updateDisplay",
    "setState",
    "renderCalendar",
    "renderProfitChart",
    "loadGlobalRanking",
    "setGlobalRankingCategory",
    "submitGlobalRanking",
    "simulateBusinessDay",
    "expectedProfitComponents",
    "expectedGameplayProfitYen",
    "gameplayBorderRotation",
    "expectedOperatingProfitYen",
}

REQUIRED_MACHINE_KEYS = {
    "eva15",
    "eva17",
    "garo",
    "garo12",
    "ghoul",
    "oumi5",
    "hokuto4",
    "rezero2",
    "shigotonin6",
}

REQUIRED_NET_PAYOUT_CALLS = {
    "netPayout(450)",
    "netPayout(1500)",
    "netPayout(3000)",
    "netPayout(6000)",
    "netPayout(300)",
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


def extract_js_object_block(script_text: str, object_key: str) -> str:
    match = re.search(rf"\b{re.escape(object_key)}\s*:\s*\{{", script_text)
    if not match:
        return ""

    depth = 0
    for index in range(match.end() - 1, len(script_text)):
        char = script_text[index]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return script_text[match.start():index + 1]
    return ""


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

    missing_net_payout_calls = {
        call for call in REQUIRED_NET_PAYOUT_CALLS if call not in script_text
    }
    if missing_net_payout_calls:
        errors.append(
            "Missing net payout conversion calls: "
            + ", ".join(sorted(missing_net_payout_calls))
        )

    if "toISOString().split('T')[0]" in script_text or 'toISOString().split("T")[0]' in script_text:
        errors.append("Virtual dates should use local date formatting, not UTC toISOString")

    garo_block = extract_js_object_block(script_text, "garo")
    if not re.search(r"\bltChallengeRate\s*:\s*0\s*,", garo_block):
        errors.append("garo should not double-apply 50% Makai entry after heso split")

    ghoul_block = extract_js_object_block(script_text, "ghoul")
    ghoul_expectations = {
        "model ghoul rush as ST, not one-roll LT": r"\bisLT\s*:\s*false\s*,",
        "avoid double-applying 51% ghoul rush entry": r"\bltChallengeRate\s*:\s*0\s*,",
        "keep ghoul rush at ST130": r"\bstSpins\s*:\s*130\s*,",
        "keep ghoul rush probability at 1/95.3": r"\bstHitProb\s*:\s*1\s*/\s*95\.3\s*,",
    }
    for description, pattern in ghoul_expectations.items():
        if not re.search(pattern, ghoul_block):
            errors.append(f"ghoul should {description}")

    shigotonin6_block = extract_js_object_block(script_text, "shigotonin6")
    shigotonin6_expectations = {
        "use the combined normal probability": r"\bhitProb\s*:\s*1\s*/\s*319\.9\s*,",
        "use ST120 at 1/88.3": r"\bstHitProb\s*:\s*1\s*/\s*88\.3\s*,[\s\S]*\bstSpins\s*:\s*120\s*,",
        "use chance time 100 at 1/399.9": r"\bjitanSpins\s*:\s*100\s*,[\s\S]*\bjitanHitProb\s*:\s*1\s*/\s*399\.9\s*,",
        "apply the 50% first-rush upgrade": r"\bfirstRushUpgradeRate\s*:\s*0\.50\s*,",
        "apply the 33% recurring upgrade": r"\brushUpgradeRate\s*:\s*0\.33\s*,",
        "model the upper-rush payout states": r"\bupperRushPayouts\s*:\s*\[",
    }
    for description, pattern in shigotonin6_expectations.items():
        if not re.search(pattern, shigotonin6_block):
            errors.append(f"shigotonin6 should {description}")

    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1

    print(f"Validated {INDEX_HTML.name}: title={title!r}, ids={len(parser.ids)}, handlers={len(handler_functions)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
