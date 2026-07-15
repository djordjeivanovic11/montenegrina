from __future__ import annotations

import os
from typing import Any

import httpx
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

from .parser import parse_document
from .rerank import normalize_scores, rerank

app = FastAPI(title="Montenegrina Knowledge Parser", version="0.1.0")


class ParseRequest(BaseModel):
    mediaType: str
    url: str | None = None


class RerankRequest(BaseModel):
    query: str
    passages: list[str] = Field(default_factory=list)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/parse-bytes")
async def parse_bytes_endpoint(
    mediaType: str = Form(...),
    file: UploadFile = File(...),
) -> dict[str, Any]:
    data = await file.read()
    max_bytes = int(os.environ.get("KNOWLEDGE_MAX_DOCUMENT_MIB", "50")) * 1024 * 1024
    if len(data) > max_bytes:
        raise HTTPException(status_code=413, detail="DOCUMENT_TOO_LARGE")
    try:
        return parse_document(data, mediaType)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.post("/v1/parse")
async def parse_endpoint(request: ParseRequest) -> dict[str, Any]:
    if not request.url:
        raise HTTPException(status_code=422, detail="url is required")
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.get(request.url)
            response.raise_for_status()
            data = response.content
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"FETCH_FAILED:{error}") from error
    try:
        return parse_document(data, request.mediaType)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.post("/v1/rerank")
def rerank_endpoint(request: RerankRequest) -> dict[str, Any]:
    if not request.passages:
        return {"scores": []}
    raw_scores = rerank(request.query, request.passages)
    return {"scores": normalize_scores(raw_scores)}


def main() -> None:
    import uvicorn

    port = int(os.environ.get("KNOWLEDGE_PARSER_PORT", "8090"))
    uvicorn.run("montenegrina_knowledge_parser.main:app", host="0.0.0.0", port=port, reload=False)
