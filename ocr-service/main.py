from __future__ import annotations

import asyncio
import io
import json
import os
import re
from typing import Any

from fastapi import FastAPI, File, Header, HTTPException, UploadFile

MAX_IMAGE_BYTES = 25 * 1024 * 1024
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
PRICE_RE = re.compile(r"(?<!\d)(?:R\$\s*)?(\d{1,3}(?:[.]\d{3})?)[,.](\d{2})(?!\d)", re.IGNORECASE)
QUANTITY_RE = re.compile(r"(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|un|und|cx|pct|pacote|fardo)\b", re.IGNORECASE)

app = FastAPI(title="PriceScan IA - PaddleOCR", version="1.0.0")
_ocr: Any = None
_ocr_lock = asyncio.Lock()


def _as_json(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    for name in ("json", "to_json"):
        candidate = getattr(value, name, None)
        if callable(candidate):
            candidate = candidate()
        if isinstance(candidate, str):
            try:
                candidate = json.loads(candidate)
            except json.JSONDecodeError:
                continue
        if isinstance(candidate, dict):
            nested = candidate.get("res")
            return nested if isinstance(nested, dict) else candidate
    return {}


def _to_box(value: Any) -> list[list[float]] | None:
    try:
        points = value.tolist() if hasattr(value, "tolist") else value
        if not isinstance(points, (list, tuple)):
            return None
        result = [[float(point[0]), float(point[1])] for point in points if isinstance(point, (list, tuple)) and len(point) >= 2]
        return result if len(result) >= 4 else None
    except (TypeError, ValueError):
        return None


def _bounds(box: list[list[float]] | None) -> dict[str, float] | None:
    if not box:
        return None
    xs = [point[0] for point in box]
    ys = [point[1] for point in box]
    left, right = min(xs), max(xs)
    top, bottom = min(ys), max(ys)
    return {"left": left, "right": right, "top": top, "bottom": bottom, "center_x": (left + right) / 2}


def _extract_items(pages: list[Any]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for page in pages:
        data = _as_json(page)
        def first_value(*keys: str) -> Any:
            for key in keys:
                value = data.get(key)
                if value is not None:
                    return value
            return []

        texts = first_value("rec_texts", "texts")
        boxes = first_value("rec_polys", "dt_polys", "boxes")
        scores = first_value("rec_scores", "scores")
        for index, value in enumerate(texts):
            text = str(value).replace("�", " ").strip()
            if not text:
                continue
            box = _to_box(boxes[index]) if index < len(boxes) else None
            score = None
            if index < len(scores):
                try:
                    score = round(float(scores[index]), 4)
                except (TypeError, ValueError):
                    pass
            items.append({"text": text, "box": box, "confidence": score})
    return items


def _price_values(text: str) -> list[float]:
    values: list[float] = []
    for match in PRICE_RE.finditer(text):
        value = float(f"{match.group(1).replace('.', '')}.{match.group(2)}")
        if value not in values:
            values.append(value)
    return values


def _structured_products(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    positioned = [{**item, "bounds": _bounds(item.get("box"))} for item in items]
    priced = [item for item in positioned if item["bounds"] and _price_values(item["text"])]
    labels = []
    for item in positioned:
        text = re.sub(r"\s+", " ", item["text"]).strip()
        words = re.findall(r"[A-Za-zÀ-ÿ]{2,}", text)
        if item["bounds"] and len(words) >= 2 and not _price_values(text) and not re.fullmatch(r"(?:r\$|kg|g|ml|l|un|und|ofertas?|válidas?)", text, re.IGNORECASE):
            labels.append(item)

    products: list[dict[str, Any]] = []
    for price_item in sorted(priced, key=lambda item: (item["bounds"]["top"], item["bounds"]["center_x"])):
        price_values = _price_values(price_item["text"])
        candidates = [label for label in labels if label["bounds"]["bottom"] <= price_item["bounds"]["bottom"] + 24]
        if not candidates:
            candidates = labels
        if not candidates:
            continue
        price_bounds = price_item["bounds"]
        label = min(candidates, key=lambda item: abs(item["bounds"]["center_x"] - price_bounds["center_x"]) + max(0, price_bounds["top"] - item["bounds"]["bottom"]) * 0.08)
        text = label["text"].strip()
        quantity = QUANTITY_RE.search(text)
        confidence_values = [value for value in (price_item.get("confidence"), label.get("confidence")) if isinstance(value, (float, int))]
        confidence = min(confidence_values) if confidence_values else 0.65
        if len(candidates) > 1:
            confidence *= 0.95
        normal_price = max(price_values) if len(price_values) > 1 and re.search(r"\b(de|por)\b", price_item["text"], re.IGNORECASE) else None
        promo_price = min(price_values) if normal_price is not None else price_values[0]
        products.append({
            "nome": text,
            "marca": None,
            "quantidade": float(quantity.group(1).replace(",", ".")) if quantity else None,
            "unidade": quantity.group(2).lower() if quantity else None,
            "preco": promo_price,
            "preco_anterior": normal_price,
            "condicoes": None,
            "confianca": round(max(0.0, min(1.0, confidence)), 3),
            "needs_review": confidence < 0.82 or normal_price is not None,
            "source_text": price_item["text"],
            "box": label["box"],
        })

    unique: list[dict[str, Any]] = []
    seen: set[tuple[str, float]] = set()
    for product in products:
        key = (product["nome"].lower(), product["preco"])
        if key not in seen:
            seen.add(key)
            unique.append(product)
    return unique


def _get_ocr() -> Any:
    global _ocr
    if _ocr is None:
        from paddleocr import PaddleOCR

        _ocr = PaddleOCR(
            lang=os.getenv("PADDLEOCR_LANG", "pt"),
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
            enable_mkldnn=False,
        )
    return _ocr


def _run_ocr(content: bytes) -> dict[str, Any]:
    import numpy as np
    from PIL import Image

    image = np.array(Image.open(io.BytesIO(content)).convert("RGB"))
    pages = list(_get_ocr().predict(image))
    items = _extract_items(pages)
    return {
        "engine": "paddleocr",
        "text": "\n".join(item["text"] for item in items),
        "items": items,
        "products": _structured_products(items),
    }


@app.get("/health")
async def health() -> dict[str, Any]:
    return {"ok": True, "engine": "paddleocr", "model_loaded": _ocr is not None}


@app.post("/ocr")
async def ocr(file: UploadFile = File(...), x_paddleocr_token: str | None = Header(default=None)) -> dict[str, Any]:
    expected_token = os.getenv("PADDLEOCR_API_TOKEN", "")
    if expected_token and x_paddleocr_token != expected_token:
        raise HTTPException(status_code=401, detail="Token PaddleOCR inválido.")
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=415, detail="Envie uma imagem JPG, PNG ou WEBP.")
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="A imagem está vazia.")
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="A imagem excede 25 MB.")
    try:
        async with _ocr_lock:
            return await asyncio.to_thread(_run_ocr, content)
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"PaddleOCR não conseguiu ler a imagem: {error}") from error
