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
  --key-field id
```

4. Abre `index.html` o sirve la carpeta con `python -m http.server`.
