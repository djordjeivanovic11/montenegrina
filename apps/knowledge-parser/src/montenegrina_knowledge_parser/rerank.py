from __future__ import annotations

from functools import lru_cache
from typing import Any

from sentence_transformers import CrossEncoder


@lru_cache(maxsize=1)
def load_reranker() -> CrossEncoder:
    return CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")


def rerank(query: str, passages: list[str]) -> list[float]:
    if not passages:
        return []
    model = load_reranker()
    pairs = [[query, passage] for passage in passages]
    scores = model.predict(pairs)
    return [float(score) for score in scores]


def normalize_scores(scores: list[float]) -> list[float]:
    if not scores:
        return []
    minimum = min(scores)
    maximum = max(scores)
    if maximum == minimum:
        return [1.0 for _ in scores]
    return [(score - minimum) / (maximum - minimum) for score in scores]
