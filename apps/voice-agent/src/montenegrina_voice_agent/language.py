# ruff: noqa: RUF001
import re
import unicodedata
from collections.abc import Callable

CYRILLIC_TO_LATIN: tuple[tuple[str, str], ...] = (
    ("Љ", "Lj"),
    ("љ", "lj"),
    ("Њ", "Nj"),
    ("њ", "nj"),
    ("Џ", "Dž"),
    ("џ", "dž"),
    ("С́", "Ś"),
    ("с́", "ś"),
    ("З́", "Ź"),
    ("з́", "ź"),
    ("А", "A"),
    ("а", "a"),
    ("Б", "B"),
    ("б", "b"),
    ("В", "V"),
    ("в", "v"),
    ("Г", "G"),
    ("г", "g"),
    ("Д", "D"),
    ("д", "d"),
    ("Ђ", "Đ"),
    ("ђ", "đ"),
    ("Е", "E"),
    ("е", "e"),
    ("Ж", "Ž"),
    ("ж", "ž"),
    ("З", "Z"),
    ("з", "z"),
    ("И", "I"),
    ("и", "i"),
    ("Ј", "J"),
    ("ј", "j"),
    ("К", "K"),
    ("к", "k"),
    ("Л", "L"),
    ("л", "l"),
    ("М", "M"),
    ("м", "m"),
    ("Н", "N"),
    ("н", "n"),
    ("О", "O"),
    ("о", "o"),
    ("П", "P"),
    ("п", "p"),
    ("Р", "R"),
    ("р", "r"),
    ("С", "S"),
    ("с", "s"),
    ("Т", "T"),
    ("т", "t"),
    ("Ћ", "Ć"),
    ("ћ", "ć"),
    ("У", "U"),
    ("у", "u"),
    ("Ф", "F"),
    ("ф", "f"),
    ("Х", "H"),
    ("х", "h"),
    ("Ц", "C"),
    ("ц", "c"),
    ("Ч", "Č"),
    ("ч", "č"),
    ("Ш", "Š"),
    ("ш", "š"),
)

PROTECTED_PATTERNS = (
    re.compile(r"https?://[^\s)\]}]+", re.IGNORECASE),
    re.compile(r"\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b"),
    re.compile(r"`[^`]+`"),
    re.compile(r"\b[A-ZČĆŽŠĐ]{2,}[A-ZČĆŽŠĐ0-9_-]*\b"),
    re.compile(r"[\"„“][^\"„“]+[\"„“]"),
)


def _protected_spans(text: str) -> list[tuple[int, int]]:
    spans: list[tuple[int, int]] = []
    for pattern in PROTECTED_PATTERNS:
        spans.extend((match.start(), match.end()) for match in pattern.finditer(text))
    spans.sort(key=lambda span: (span[0], -(span[1] - span[0])))
    result: list[tuple[int, int]] = []
    for start, end in spans:
        if not result or start >= result[-1][1]:
            result.append((start, end))
    return result


def _outside_spans(text: str, transform: Callable[[str], str]) -> str:
    cursor = 0
    output = ""
    for start, end in _protected_spans(text):
        output += transform(text[cursor:start])
        output += text[start:end]
        cursor = end
    return output + transform(text[cursor:])


def to_latin(text: str) -> str:
    normalized = unicodedata.normalize("NFC", text)

    def transform(fragment: str) -> str:
        result = fragment
        for cyrillic, latin in CYRILLIC_TO_LATIN:
            result = result.replace(cyrillic, latin)
        return result

    return _outside_spans(normalized, transform)


def normalize_voice_text(text: str, script: str = "LATIN") -> str:
    normalized = re.sub(r"[ \t]+", " ", unicodedata.normalize("NFC", text))
    normalized = re.sub(r"\s+([,.;:!?])", r"\1", normalized).strip()
    if script.upper() == "LATIN":
        return to_latin(normalized)
    return normalized


def normalize_voice_stream_text(text: str, script: str = "LATIN") -> str:
    normalized = unicodedata.normalize("NFC", text)
    leading_match = re.match(r"^\s+", normalized)
    trailing_match = re.search(r"\s+$", normalized)
    leading = leading_match.group(0) if leading_match else ""
    trailing = trailing_match.group(0) if trailing_match else ""
    if leading and len(leading) == len(normalized):
        return leading
    start = len(leading)
    end = len(normalized) - len(trailing)
    core = normalized[start:end]
    core = re.sub(r"[ \t]+", " ", core)
    core = re.sub(r"\s+([,.;:!?])", r"\1", core)
    result = f"{leading}{core}{trailing}"
    if script.upper() == "LATIN":
        return to_latin(result)
    return result


NO_SPACE_BEFORE = set(",.;:!?)]}%»”")
NO_SPACE_AFTER = set("([{«„")


def needs_stream_space(previous: str, current: str) -> bool:
    if not previous or not current:
        return False
    last = previous[-1]
    first = current[0]
    if last.isspace() or first.isspace():
        return False
    if first in NO_SPACE_BEFORE or last in NO_SPACE_AFTER:
        return False
    if last == "-" or first == "-":
        return False
    if last.isalnum() and (first.isalnum() or first in "([{«„“\""):
        return True
    if last in ".!?,;:" and (first.isalnum() or first in "([{«„“\""):
        return True
    if last in ")]}%»”\"" and first.isalnum():
        return True
    return False


class VoiceStreamStitcher:
    def __init__(self, script: str = "LATIN") -> None:
        self._script = script
        self._tail = ""

    def push(self, text: str) -> str:
        normalized = normalize_voice_stream_text(text, self._script)
        if needs_stream_space(self._tail, normalized):
            normalized = f" {normalized}"
        if normalized:
            self._tail = normalized[-1]
        return normalized
