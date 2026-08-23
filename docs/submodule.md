# Usar Tesela como Git submodule

Tesela puede permanecer fijado a un commit o tag dentro de un proyecto host. La
configuración, los datos y el adaptador de dominio viven fuera del submódulo, por
lo que actualizarlo no sobrescribe archivos del mapa consumidor.

## Estructura recomendada

```text
mi-mapa/
├── vendor/tesela/          # submódulo, solo lectura
├── app.config.js           # dominio del proyecto
├── data/bundle.js          # generado en el host
├── scripts/source.py       # Source externo
├── src/domain.js           # hooks/slots del dominio
└── index.html
```

## Instalación

```bash
git submodule add <URL_GIT_DE_TESELA> vendor/tesela
git -C vendor/tesela checkout <tag-o-commit-aprobado>
git add .gitmodules vendor/tesela
```

Al clonar el proyecto host:

```bash
git clone --recurse-submodules <URL_DEL_PROYECTO>
# o, en un clone existente:
git submodule update --init --recursive
```

## HTML del host

El host carga su propia configuración, datos y adaptador entre los assets de
Tesela. Debe conservarse el orden declarado en `tesela.assets.json`.

```html
<link rel="stylesheet" href="vendor/tesela/src/ui/tesela.css" />

<script src="vendor/tesela/src/engine/namespace.js"></script>
<script src="app.config.js"></script>
<script src="data/bundle.js"></script>
<script src="vendor/tesela/src/engine/format.js"></script>
<script src="vendor/tesela/src/engine/geo.js"></script>
<script src="vendor/tesela/src/engine/join.js"></script>
<script src="vendor/tesela/src/engine/search.js"></script>
<script src="vendor/tesela/src/engine/scoring.js"></script>
<script src="vendor/tesela/src/engine/color.js"></script>
<script src="vendor/tesela/src/engine/bundle.js"></script>
<script src="vendor/tesela/src/engine/config.js"></script>
<script src="vendor/tesela/src/engine/extensions.js"></script>
<script src="vendor/tesela/src/ui/map-layers.js"></script>
<script src="src/domain.js"></script>
<script src="vendor/tesela/src/app.js"></script>
```

Leaflet sigue siendo una peer dependency y debe cargarse antes de `app.js`.

## Generar datos fuera del submódulo

Ejecuta el pipeline de Tesela indicando la raíz, Source y salida del host:

```bash
python vendor/tesela/scripts/build_data.py \
  --source-path scripts/source.py \
  --project-root "$PWD" \
  --output data/bundle.js \
  --join-property ID \
  --key-field id
```

`--source-path` y `--output` relativos se resuelven contra `--project-root`. El
pipeline nunca necesita escribir dentro de `vendor/tesela`. Si el constructor de
`Source` acepta `project_root`, Tesela se lo entrega como `Path` absoluto.

Los argumentos antiguos `--source` y `--data-dir` siguen funcionando para los
Sources incluidos en Tesela.

## Actualizar Tesela

```bash
git -C vendor/tesela fetch --tags
git -C vendor/tesela checkout <nuevo-tag-o-commit>
git add vendor/tesela
git commit -m "build: update Tesela"
```

El commit del submódulo forma parte del proyecto host. No uses seguimiento
automático de una rama en producción: revisa changelog, migración y tests antes de
actualizar el puntero.

Cada versión oficial ofrece tanto `release/vX.Y.Z` como el tag anotado `vX.Y.Z`.
Para producción se recomienda fijar el tag; la rama dedicada permite inspeccionar
la versión o configurar `git submodule update --remote` de forma explícita.

## Plantilla

`templates/submodule-host/` contiene una estructura mínima para copiar a un nuevo
proyecto host. Después de copiarla, añade Tesela en `vendor/tesela`, genera el
bundle y abre `index.html`.
