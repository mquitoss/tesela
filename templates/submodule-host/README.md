# Plantilla de host Tesela

1. Copia el contenido de esta carpeta a un repositorio nuevo.
2. Añade Tesela como `vendor/tesela`.
3. Genera los datos:

```bash
python vendor/tesela/scripts/build_data.py \
  --source-path scripts/source.py \
  --project-root "$PWD" \
  --output data/bundle.js \
  --join-property ID \
  --key-field id \
  --no-attach-indicators
```

`Source.attach_indicators = False` ofrece el mismo modo compacto desde el Source.
Los Sources antiguos que no declaran la opción conservan el comportamiento 0.2.

4. Construye una carpeta pública con una allowlist de assets:

```bash
npm run build
```

El build falla antes de borrar `dist/` si el submódulo no está inicializado y
aplica el límite declarado en `tesela.assets.json`.

5. Conserva el orden de scripts de `index.html`: `search.js` va después de
   `join.js`; `providers.js`, `map-layers.js`, `detail.js` y los providers
   opcionales van antes del adapter y `app.js`.
6. Abre `index.html` directamente para probar `file://` o sirve `dist/` mediante
   `python -m http.server`; comprueba búsqueda y detalle en ambos modos.

El workflow de `.github/workflows/ci.yml` usa checkout recursivo. En otras
plataformas ejecuta antes del build:

```bash
git submodule update --init --recursive
```
