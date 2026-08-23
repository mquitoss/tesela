# Tesela

Tesela es un motor y shell **zero-build** para crear aplicaciones cartográficas
configurables: coropletas, scoring ponderado, paneles de detalle y extensiones de
dominio. Combina geometrías, datos y capas para convertir información territorial
fragmentada en mapas comprensibles.

La configuración, los adaptadores y el Source describen el dominio. El motor
permanece agnóstico y conserva `null` como ausencia real, sin convertir huecos en
cero.

## Arquitectura

```text
app.config.js ──────────────┐
                           ▼
data/bundle.js ─────► Tesela.engine ─────► src/app.js ─────► Leaflet
      ▲                    ▲                    ▲
      │                    │                    │ slots UI
scripts/build_data.py      └──── src/adapters/domain.js
      ▲
scripts/sources/<source>.py
```

- **Engine**: join, búsqueda, scoring, color, geometría, formato, bundles,
  validación y extensiones; funciones puras con CommonJS y UMD.
- **Shell**: Leaflet y DOM dirigidos por `TESELA_CONFIG`.
- **Pipeline**: un `Source` produce geometría e indicadores y genera
  `TESELA_DATA`.
- **Adapters**: métricas derivadas, simulación y slots específicos del dominio.

Tesela puede consumirse directamente o fijarse como Git submodule. En ese modo,
el host mantiene fuera del submódulo su config, Source, datos y adapter. Consulta
[`docs/submodule.md`](docs/submodule.md).

Los contratos objetivo de scoring, búsqueda, overlays, providers y detalle para
la próxima versión están congelados en
[`docs/public-contracts-v0.3.md`](docs/public-contracts-v0.3.md). El documento
distingue expresamente esas APIs de las capacidades ya publicadas en 0.2.

## Arranque rápido

```bash
npm install
npm test
.venv/bin/python -m pytest
open index.html
```

Para regenerar el ejemplo de densidad de población por barrio de Barcelona:

```bash
.venv/bin/python scripts/build_data.py --source example_source
```

## Configuración declarativa

El punto principal de personalización es `app.config.js`:

- `branding`: marca y namespace de datos;
- `ui`: locale, textos y rango de sliders;
- `mounts`: ids de los contenedores del shell;
- `map`: centro, zoom y teselas;
- `join`: claves canónicas de geometría e indicadores;
- `indicators`: presentación de métricas;
- `color`: métrica y rampa de la coropleta;
- `scoring`: factores, pesos y presets;
- `detail`: campos de la ficha;
- `extensions.slots`: extensiones visuales opcionales.

Tesela valida la configuración antes de inicializar Leaflet. Los errores muestran
la ruta del campo inválido en lugar de fallar silenciosamente.

La normalización del fallback por nombre también es configurable mediante
`join.nameNormalization`: se pueden indicar artículos propios del idioma o usar
`removeArticles: false`.

`ui.search` activa un buscador de zonas con límite y zoom configurables. Los
campos aceptan los formatos `plain`, `number`, `percent`, `boolean` y `duration`;
las etiquetas booleanas, unidades temporales y textos de búsqueda pertenecen al
host y pueden localizarse sin modificar el motor.

## Slots de UI

La primera API de extensión incluye:

```text
sidebar.afterStatus
sidebar.afterControls
detail.beforeFields
```

Cada handler recibe `{ config, state, zone?, score? }` y puede devolver texto, un
nodo DOM o una lista de ambos. Los errores de un slot quedan aislados y no
bloquean el mapa.

```js
extensions: {
  slots: {
    "sidebar.afterStatus": ({ state }) => {
      const note = document.createElement("p");
      note.textContent = `${state.matched} zonas enlazadas`;
      return note;
    },
  },
}
```

La misma API está disponible en `Tesela.adapters.slots` para mantener fuera de la
configuración la lógica compleja de dominio.

## Contrato de datos

Un Source implementa:

```python
class Source:
    def geometry(self) -> dict:
        ...  # FeatureCollection GeoJSON

    def indicators(self) -> list[dict]:
        ...  # registros con la clave canónica

    def metadata(self) -> dict:  # opcional
        ...
```

El pipeline rechaza claves ausentes o duplicadas, indicadores sin geometría y
namespaces JavaScript inseguros. El bundle nuevo publica:

```js
window.TESELA_DATA = { geo, indicators, meta };
window.SSM_DATA = window.TESELA_DATA; // compatibilidad 0.x
```

## Compatibilidad con Self Service Map

La versión `0.2.0` introduce la marca y globals de Tesela sin romper proyectos
anteriores:

| API recomendada | Alias temporal |
|---|---|
| `window.Tesela` | `window.SSM` |
| `window.TESELA_CONFIG` | `window.SSM_CONFIG` |
| `window.TESELA_DATA` | `window.SSM_DATA` |

Ambos namespaces apuntan al mismo objeto. Los ids y clases CSS `ssm-*` se
conservan durante la serie `0.x`. Consulta
[`docs/migrating-from-ssm.md`](docs/migrating-from-ssm.md).

## Estructura

| Ruta | Función |
|---|---|
| `src/engine/namespace.js` | Runtime y aliases compatibles |
| `src/engine/config.js` | Validación declarativa |
| `src/engine/extensions.js` | Slots aislados |
| `src/ui/tesela.css` | Estilos públicos reutilizables |
| `src/engine/*.js` | Motor agnóstico |
| `src/app.js` | Shell Leaflet/DOM |
| `src/adapters/domain.js` | Hooks y slots de dominio |
| `scripts/build_data.py` | Source → bundle validado |
| `tests/` | Vitest y pytest |
| `docs/tesela-upgrade-plan.md` | Plan evolutivo hasta Tesela 1.0 |
| `docs/public-contracts-v0.3.md` | Contratos objetivo de Tesela 0.3 |
| `tesela.assets.json` | Orden y versión de assets públicos |
| `templates/submodule-host/` | Proyecto host mínimo para copiar |

## Estado de APIs experimentales

`levels`, `bbox` y `simulate` continúan siendo experimentales: existen helpers o
descriptores, pero el shell todavía no ofrece selector multinivel, aplicación de
bbox ni interfaz de simulación. No deben presentarse como capacidades completas.

Los temas pueden sobrescribir las variables CSS prefijadas `--tesela-bg`,
`--tesela-panel`, `--tesela-ink`, `--tesela-muted`, `--tesela-accent` y
`--tesela-line` sin reutilizar nombres genéricos del proyecto host.

## Desarrollo

```bash
npm test
.venv/bin/python -m pytest
.venv/bin/ruff check .
.venv/bin/mypy scripts tests
```

La hoja de ruta completa está en
[`docs/tesela-upgrade-plan.md`](docs/tesela-upgrade-plan.md).

## Versiones y releases

La versión se sincroniza entre JavaScript, Python, configuración, manifiesto de
assets y changelog. Cada publicación crea una rama y un tag dedicados que apuntan
al mismo commit:

```text
release/v0.3.0
v0.3.0
```

```bash
npm run version:check
npm run release -- 0.3.0 --dry-run
npm run release -- 0.3.0 --push
```

El tag es la referencia inmutable recomendada para submódulos. Consulta
[`docs/releases.md`](docs/releases.md) para el flujo completo y la recuperación
ante errores.
