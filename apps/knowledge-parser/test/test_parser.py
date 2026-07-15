from __future__ import annotations

import unittest

from montenegrina_knowledge_parser.sanitization import sanitize_metadata, sanitize_text


class ParserSanitizationTests(unittest.TestCase):
    def test_removes_postgres_incompatible_nul_characters(self) -> None:
        self.assertEqual(sanitize_text("Heading\x00\nBody\x00 text"), "Heading\nBody text")

    def test_sanitizes_nested_metadata(self) -> None:
        metadata = sanitize_metadata({"bad\x00key": {"items": ["bad\x00value"]}})

        self.assertEqual(metadata, {"badkey": {"items": ["badvalue"]}})


if __name__ == "__main__":
    unittest.main()
