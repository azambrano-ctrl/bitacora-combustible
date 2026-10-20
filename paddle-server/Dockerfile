FROM python:3.11-slim

# system libraries OpenCV (used by PaddleOCR) needs
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Hugging Face runs the container as user 1000; keep caches and models in a writable folder
ENV HOME=/app PADDLE_PDX_CACHE_HOME=/app/.paddlex PYTHONUNBUFFERED=1 PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .
# download the OCR models at build time so the first request doesn't wait for them
RUN python -c "import app; app.get_ocr()" && chmod -R 777 /app

EXPOSE 7860
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
