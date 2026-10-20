"""PaddleOCR server for Bitácora de Combustible (runs as a Hugging Face Space, Docker SDK).

POST /ocr   {"image": "data:image/jpeg;base64,..."}   header: X-Token: <PADDLE_TOKEN>
  → {"words": [{"t": text, "x": left, "y": top, "w": width, "h": height, "s": score}, ...], "text": "...", "ms": 1234}
GET  /      health check

The Supabase function "read-sheet" calls this; the app rebuilds the sheet's table from each word's position.
"""
import base64
import io
import os
import time

import numpy as np
from fastapi import FastAPI, Header, HTTPException
from PIL import Image, ImageOps
from pydantic import BaseModel

TOKEN = os.environ.get("PADDLE_TOKEN", "")
# server models are the most accurate; set PADDLE_MODELS=mobile for faster, lighter reads
MODELS = os.environ.get("PADDLE_MODELS", "server")
MAX_SIDE = int(os.environ.get("PADDLE_MAX_SIDE", "2400"))

app = FastAPI(title="Bitácora PaddleOCR")
_ocr = None


def get_ocr():
    global _ocr
    if _ocr is None:
        from paddleocr import PaddleOCR
        _ocr = PaddleOCR(
            text_detection_model_name=f"PP-OCRv5_{MODELS}_det",
            text_recognition_model_name=f"PP-OCRv5_{MODELS}_rec",
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
        )
    return _ocr


class OcrIn(BaseModel):
    image: str


def decode(data_url: str) -> np.ndarray:
    try:
        b64 = data_url.split(",", 1)[1] if data_url.startswith("data:") else data_url
        img = Image.open(io.BytesIO(base64.b64decode(b64)))
        img = ImageOps.exif_transpose(img).convert("RGB")
    except Exception:
        raise HTTPException(400, "La imagen no se pudo leer.")
    if max(img.size) > MAX_SIDE:
        img.thumbnail((MAX_SIDE, MAX_SIDE))
    return np.array(img)[:, :, ::-1]  # RGB → BGR, as PaddleOCR expects


def field(res, key):
    """OCRResult is dict-like in PaddleOCR 3.x; older builds nest the values under .json['res']."""
    try:
        return res[key]
    except Exception:
        return res.json["res"][key]


@app.get("/")
def health():
    return {"ok": True, "models": MODELS, "loaded": _ocr is not None}


@app.post("/ocr")
def ocr(body: OcrIn, x_token: str = Header(default="")):
    if TOKEN and x_token != TOKEN:
        raise HTTPException(401, "Token inválido.")
    started = time.time()
    img = decode(body.image)
    result = get_ocr().predict(img)
    words = []
    for res in result:
        texts, scores, boxes = field(res, "rec_texts"), field(res, "rec_scores"), field(res, "rec_boxes")
        for t, s, b in zip(texts, scores, boxes):
            x0, y0, x1, y1 = [int(v) for v in b]
            words.append({"t": t, "x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0, "s": round(float(s), 3)})
    words.sort(key=lambda w: (w["y"], w["x"]))
    return {"words": words, "text": "\n".join(w["t"] for w in words), "ms": int((time.time() - started) * 1000)}


@app.on_event("startup")
def warm_up():
    get_ocr()  # load the models once, before the first request
