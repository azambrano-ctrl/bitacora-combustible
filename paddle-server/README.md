---
title: Bitacora PaddleOCR
emoji: 🚚
colorFrom: gray
colorTo: red
sdk: docker
app_port: 7860
pinned: false
---

# Servidor PaddleOCR para la Bitácora de Combustible

Lee las fotos de las hojas con **PaddleOCR (PP-OCRv5)** y devuelve cada palabra con su posición.
La función `read-sheet` de Supabase lo llama y la app arma la tabla (fecha × columna).

## Crear el Space (una sola vez)

1. Crea una cuenta gratis en [huggingface.co](https://huggingface.co).
2. **New Space** → nombre `bitacora-paddleocr` → SDK **Docker** → plantilla **Blank** → hardware **CPU basic (free)** → **Public** o **Private**.
3. Sube estos 4 archivos al Space (**Files → Add file → Upload files**): `README.md`, `Dockerfile`, `app.py`, `requirements.txt`.
4. En el Space: **Settings → Variables and secrets → New secret** → nombre `PADDLE_TOKEN`, valor: una contraseña larga que inventes.
5. Espera a que diga **Running** (la primera vez tarda unos 10 minutos mientras instala PaddleOCR y baja los modelos).

## Conectar con Supabase

En Supabase → Edge Functions → Secrets agrega:

- `PADDLE_URL` = la dirección del Space, por ejemplo `https://TU-USUARIO-bitacora-paddleocr.hf.space`
- `PADDLE_TOKEN` = la misma contraseña del paso 4

## Notas

- Plan gratis: si nadie lo usa en 48 horas se duerme; la primera foto después tarda 1–2 minutos.
- Cada lectura en CPU tarda unos 15–40 segundos. `PADDLE_MODELS=mobile` (variable del Space) lo hace más rápido pero un poco menos preciso.
