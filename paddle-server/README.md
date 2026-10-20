# Servidor PaddleOCR para la Bitácora de Combustible

Lee las fotos de las hojas con **PaddleOCR (PP-OCRv5)** y devuelve cada palabra con su posición.
La función `read-sheet` de Supabase lo llama (lector "PaddleOCR") y la app arma la tabla (fecha × columna).

```
app.py           el servidor (FastAPI): POST /ocr {"image": "data:image/jpeg;base64,..."} → {"words": [...]}
modal_app.py     publicación en Modal (recomendado: $30 de cómputo gratis al mes, sin tarjeta)
Dockerfile       por si algún día se usa otro hospedaje con Docker
requirements.txt dependencias de Python
```

## Publicar en Modal

1. Crea una cuenta en [modal.com](https://modal.com) (con tu cuenta de GitHub).
2. En esta computadora:

   ```bash
   python -m pip install --user modal
   ```

   ```bash
   python -m modal token new
   ```

   ```bash
   python -m modal deploy paddle-server/modal_app.py
   ```

3. Modal muestra la dirección del servidor (termina en `.modal.run`). En Supabase → Edge Functions → Secrets
   ponla como `PADDLE_URL`.

Opcional, para que solo tu función pueda usarlo: en Modal crea el secreto `bitacora-paddle` con `PADDLE_TOKEN`,
agrégalo a `modal_app.py` (`secrets=[modal.Secret.from_name("bitacora-paddle")]`) y pon el mismo valor como
`PADDLE_TOKEN` en Supabase.

## Notas

- Se apaga 5 minutos después de la última foto; la primera foto después tarda unos 30–60 s en despertar.
- Cada hoja usa unos segundos de CPU: los $30 gratis del mes alcanzan para miles de hojas.
- `MODELS = "mobile"` en `modal_app.py` lo hace más rápido pero un poco menos preciso.
