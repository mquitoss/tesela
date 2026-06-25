# Self Service Map

Framework base **zero-build** para crear mapas que muestran datos: coropleta interactiva +
scoring ponderado + panel de detalle, todo dirigido por una **configuración declarativa** y
**adaptadores de datos**. Pensado para que un agente lo personalice desde el prompt de un usuario
en vez de empezar de cero (ver **[AGENTS.md](./AGENTS.md)**).

Destila la arquitectura común de dos proyectos previos (`quirat-barcelona`, `invest-map`): misma
plantilla de mapa + datos, parametrizada.

## Cómo funciona

```
                 app.config.js  (qué mapa, qué datos, qué colores, qué factores)
                       │
data/bundle.js  ───────┼───────►  src/engine/*  (motor agnóstico)  ───►  index.html (Leaflet)
 (window.SSM_DATA)     │              ▲
                       │              │ hooks opcionales
 scripts/build_data.py ┘        src/adapters/domain.js
   + scripts/sources/<x>.py
```

- **Frontend**: vanilla JS + Leaflet 1.9.4 (CDN). Sin transpilación: se abre con doble clic
  (`file://`). El motor (`src/engine/`) usa un patrón UMD ligero — una sola fuente de verdad por
  función, cargada por `<script src>` en el navegador y por `require()` en los tests.
- **Pipeline**: `scripts/build_data.py` orquesta un *Source* (`scripts/sources/`) y emite
  `data/bundle.js`. El motor y el pipeline son agnósticos; lo específico vive en config + Source.

## Arranque rápido

```bash
# 1. Abrir el mapa de ejemplo (densidad de población por barrio de Barcelona)
open index.html            # o doble clic; el bundle de ejemplo ya viene generado

# 2. Tests del motor (frontend)
npm install && npm test

# 3. Tests del pipeline (backend)
python -m venv .venv && .venv/bin/pip install pytest
.venv/bin/python -m pytest

# 4. Regenerar los datos de ejemplo (requiere red: martgnz + Open Data BCN)
python scripts/build_data.py --source example_source
```

## Estructura

| Ruta | Qué es |
|---|---|
| `index.html` | Shell zero-build (carga config, datos, engine y app por `<script src>`) |
| `app.config.js` | **Configuración declarativa** del mapa (el punto de personalización principal) |
| `src/engine/*.js` | Motor agnóstico: `join`, `scoring`, `color`, `geo`, `bundle`, `format` |
| `src/adapters/domain.js` | Hooks opcionales `derive` / `simulate` |
| `src/app.js` | Cableado Leaflet/DOM dirigido por la config |
| `scripts/build_data.py` | Pipeline base (Source → `bundle.js`) |
| `scripts/sources/` | Adaptadores de fuente (`example_source.py` + contrato `base.py`) |
| `data/bundle.js` | Datos generados (`window.SSM_DATA = {geo, indicators, meta}`) |
| `tests/` | Vitest (engine) + pytest (pipeline) |
| `AGENTS.md` | Guía de personalización para agentes |

## Dataset de ejemplo

Densidad de población por barrio de Barcelona (73 barris). Fuentes públicas:
geometría [`martgnz/bcn-geodata`](https://github.com/martgnz/bcn-geodata) (CC-BY) y padró
municipal de [Open Data BCN](https://opendata-ajuntament.barcelona.cat/). Es un dataset neutro:
demuestra coropleta + scoring sin sesgo temático.

## Crear tu propio mapa

Lee **[AGENTS.md](./AGENTS.md)**. En resumen: edita `app.config.js`, clona
`scripts/sources/example_source.py` para tu fuente, (opcional) implementa `derive`/`simulate`,
ejecuta el build y verifica con los tests. No toques `src/engine/*`.
