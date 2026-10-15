# Bitácora de Combustible

App web para llevar la **hoja mensual de millas (Monthly Log Miles)** de cada camión y sacar el **reporte trimestral de fuel taxes** en PDF.

- **Hoja mensual**: igual que la hoja en papel. Escribes el odómetro de cada día y las millas se calculan solas.
- **Hoy**: formulario sencillo para que el chofer llene su día desde el celular.
- **Reporte de fuel taxes**: se llena solo con las cargas de diésel; se puede corregir ahí mismo y se descarga en PDF.
- **Subir hojas**: subes la foto de una hoja ya llena, OCR.space la lee y la app acomoda los números en sus columnas. Revisas y guardas.
- **Camiones**: número, compañía, modelo, chofer y cambios de aceite.

La página se publica gratis en **GitHub Pages**. Los datos y el inicio de sesión viven en **Supabase** (plan gratis). La lectura de fotos usa **OCR.space** (plan gratis: 25,000 lecturas al mes, fotos de hasta 1 MB).

```
index.html, styles.css, app.js   la página
config.js                        datos de tu proyecto de Supabase (URL y anon key)
supabase/schema.sql              la tabla y los permisos
supabase/functions/read-sheet/   función que manda la foto a OCR.space (guarda tu clave en secreto)
```

---

## 1. Crear el proyecto en Supabase

1. Entra a [supabase.com](https://supabase.com), crea una cuenta y un proyecto nuevo (plan Free).
2. Ve a **SQL Editor → New query**, pega todo el contenido de [`supabase/schema.sql`](supabase/schema.sql) y presiona **Run**.
3. Ve a **Authentication → Sign In / Providers** y **apaga "Allow new users to sign up"**. Así nadie de fuera puede crear cuenta; solo entran las personas que tú invites.
4. Ve a **Authentication → URL Configuration** y en **Site URL** pon la dirección de tu página de GitHub Pages (paso 4), por ejemplo `https://TU-USUARIO.github.io/bitacora-combustible/`.
5. Ve a **Project Settings → API** y copia:
   - **Project URL**
   - **anon public key**

   Pégalos en [`config.js`](config.js):

   ```js
   window.BC_CONFIG = {
     supabaseUrl: "https://xxxx.supabase.co",
     supabaseAnonKey: "eyJhbGciOi...",
   };
   ```

   La anon key es pública por diseño: sin iniciar sesión no se puede leer ni escribir nada, porque la tabla solo deja entrar a usuarios con sesión.

## 2. Invitar usuarios (tú y los choferes)

**Authentication → Users → Add user → Send invitation**, con el correo de cada persona. Le llega un correo; al abrir el enlace, la app le pide crear su contraseña. Después entra con su correo y contraseña.

## 3. Lector de fotos (OCR.space)

1. Saca una clave gratis en [ocr.space/ocrapi](https://ocr.space/ocrapi) (llega a tu correo).
2. Instala la [CLI de Supabase](https://supabase.com/docs/guides/cli) y, dentro de esta carpeta:

   ```bash
   supabase login
   ```

   ```bash
   supabase link --project-ref TU-PROJECT-REF
   ```

   ```bash
   supabase secrets set OCR_SPACE_API_KEY=TU-CLAVE-DE-OCR-SPACE
   ```

   ```bash
   supabase functions deploy read-sheet
   ```

   `TU-PROJECT-REF` es la parte `xxxx` de `https://xxxx.supabase.co`.

**La clave de OCR.space nunca va en el código ni en GitHub**: queda guardada como secreto en Supabase.

Opcional: OCR.space tiene un motor para letra a mano. Para probarlo:

```bash
supabase secrets set OCR_SPACE_ENGINE=3
```

Con letra a mano, OCR comete errores. Por eso la pantalla de revisión compara las millas escritas con las del odómetro y marca en amarillo lo que no cuadra; nada se guarda sin que lo revises.

## 4. Publicar en GitHub Pages

```bash
git add .
```

```bash
git commit -m "Bitácora de Combustible"
```

Crea un repositorio vacío en GitHub (por ejemplo `bitacora-combustible`) y súbelo:

```bash
git remote add origin https://github.com/TU-USUARIO/bitacora-combustible.git
```

```bash
git push -u origin main
```

En GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: main / (root) → Save**. En un par de minutos la página queda en `https://TU-USUARIO.github.io/bitacora-combustible/`.

## Probar en tu computadora

Sin `config.js` configurado, la app abre en **modo de prueba** (no guarda nada). Para verla:

```bash
python -m http.server 8080
```

y abre `http://localhost:8080`.

## Cómo calcula

- **Millas del día** = odómetro de hoy − última lectura anterior.
- **Millas del trimestre** = odómetro de cierre − odómetro de apertura. El cierre de un trimestre pasa solo como apertura del siguiente.
- **Precio promedio**: ponderado (costo total ÷ galones) o simple (promedio de los precios de cada carga, como en la hoja en papel). Se escoge en el reporte.
