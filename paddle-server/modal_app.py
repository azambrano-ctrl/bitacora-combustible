"""Deploy the PaddleOCR server (app.py) on Modal: free monthly compute, no card, sleeps when idle.

    python -m modal deploy paddle-server/modal_app.py

Modal prints the web address (…modal.run); put it in Supabase as PADDLE_URL.
Optional: create a Modal secret "bitacora-paddle" with PADDLE_TOKEN and set the same value in Supabase.
"""
import pathlib

import modal

HERE = pathlib.Path(__file__).parent
MODELS = "server"  # most accurate PP-OCRv5 models; "mobile" is lighter and faster


def download_models():
    """Bake the OCR models into the image so a cold start doesn't download them."""
    from paddleocr import PaddleOCR

    PaddleOCR(
        text_detection_model_name=f"PP-OCRv5_{MODELS}_det",
        text_recognition_model_name=f"PP-OCRv5_{MODELS}_rec",
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
    )


image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("libgl1", "libglib2.0-0", "libgomp1")
    .pip_install("paddlepaddle==3.0.0", "paddleocr>=3.0,<4", "fastapi[standard]>=0.110", "pillow>=10", "numpy<2")
    .env({"PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK": "True", "PADDLE_MODELS": MODELS, "PYTHONUNBUFFERED": "1"})
    .run_function(download_models)
    .add_local_file(HERE / "app.py", "/root/app.py")
)

app = modal.App("bitacora-paddleocr")


@app.function(
    image=image,
    cpu=2.0,
    memory=4096,
    timeout=180,
    scaledown_window=300,  # stay warm 5 minutes after the last photo, then sleep (no cost while asleep)
)
@modal.concurrent(max_inputs=2)
@modal.asgi_app()
def web():
    import sys

    sys.path.insert(0, "/root")
    from app import app as fastapi_app

    return fastapi_app
