# AGENTS.md — Guía para personalizar Self Service Map desde un prompt

Este repositorio es un **framework base preconfigurado** para crear mapas que muestran datos
(coropleta + scoring ponderado + panel de detalle). Está pensado para que un agente (como tú) lo
adapte a un nuevo dominio **a partir de un prompt del usuario**, sin empezar de cero.

La regla de oro: **el motor (`src/engine/*`) es agnóstico al dominio y NO se toca.** Todo lo
específico del mapa que pide el usuario se expresa en **tres lugares**:

1. `app.config.js` — configuración declarativa (lo más común).
2. `scripts/sources/<nombre>.py` — el adaptador que trae los datos (clonar `example_source.py`).
3. `src/adapters/domain.js` — hooks opcionales (`derive`, `simulate`) para lógica que la config
   declarativa no expresa.

---

## Flujo de personalización (en orden)

### 1. Editar `app.config.js`
Mapea el dominio del prompt a la config. Tabla de traducción:

| El usuario pide… | Campo de config |
|---|---|
| "un mapa de **\<territorio\>**" centrado en X | `map.center`, `map.zoom`, `map.bbox` |
| título / subtítulo / color de marca | `branding.title`, `branding.subtitle`, `branding.accent` |
| las zonas se identifican por **\<campo\>** | `join.property` (en la geometría) + `join.keyField` (en el indicador) |
| emparejar también por nombre | `join.nameFallback: true`, `join.nameProperty`, `join.nameField` |
| dos granularidades (p. ej. barrio/sección) | `levels: [...]` y el bundle multinivel (`levels` en `bundle.js`) |
| "muestra **\<estas métricas\>**" | `indicators: [{ key, label, format, unit }]` |
| "colorea por **\<métrica\>**" | `color.metric` (`"score"` o la clave de un indicador) + `color.ramp` |
| "que el usuario pondere **\<factores\>**" | `scoring.factors: [{ key, indicator, kind, sign, defaultWeight }]` |
| "presets / tesis predefinidas" | `scoring.presets: [{ id, label, weights }]` |
| "penalizar zonas con **\<flag\>**" | un factor con `kind: "penalty"` |
| "favorecer valores **bajos** de \<métrica\>" | un factor con `sign: -1` |
| panel de detalle con campos concretos | `detail.fields: [{ key, label, format }]` |

### 2. Implementar el adaptador de datos
Clona `scripts/sources/example_source.py` a `scripts/sources/<tu_dominio>.py` e implementa el
contrato de `scripts/sources/base.py`:

```python
class Source:
    def geometry(self) -> dict:          # FeatureCollection GeoJSON con la clave de join en properties
        ...
    def indicators(self) -> list[dict]:  # [{ <keyField>, nom, <metricas...> }]
        ...
```

Después genera el bundle:
```bash
python scripts/build_data.py --source <tu_dominio> --join-property <PROP> --key-field <campo>
```

### 3. (Opcional) Hooks de dominio
Si hay una **métrica derivada** (p. ej. `rendiment = lloguer*12/venda*100`) o un **simulador**,
impleméntalos en `src/adapters/domain.js` (`derive`, `simulate`). Por defecto son identidades.

---

## Invariantes que SIEMPRE debes respetar

Heredados de los proyectos origen (quirat / invest-map); romperlos produce mapas deshonestos:

- **`null` es un hueco de primera clase.** Un dato ausente se representa como `null` y NUNCA se
  coacciona a 0. El min-max lo excluye, el coloreo aplica el estilo "sin dato" y el ranking lo
  deja fuera. No fabriques valores para rellenar.
- **Clave canónica primero, nombre como fallback.** El join se hace por la clave estable
  (`join.property`); el nombre normalizado es solo respaldo y nunca sobrescribe la clave.
- **El motor no conoce tu dominio.** Si te ves editando `src/engine/*` para un caso concreto, casi
  seguro lo correcto es un campo de config o un hook de adaptador.
- **Descubre fuentes por slug/texto, no por UUID.** En el Source, resuelve recursos por su nombre
  estable (como hace el ejemplo) para que el build no se rompa cuando cambie un id interno.
- **Cero build.** Nada de transpilación: el HTML carga `<script src>` planos y abre bajo `file://`.

---

## Verificación (hazla siempre al terminar)

```bash
npm test          # 1) engine (Vitest): join, scoring con huecos, color, geo, bundle, format
python -m pytest  # 2) pipeline (pytest): build_data + adaptador, sin red
python scripts/build_data.py --source <tu_dominio>   # 3) genera data/bundle.js
# 4) abre index.html (doble clic) → mapa coloreado, presets/sliders, panel de detalle, sin errores
```

### Checklist final
- [ ] `app.config.js` refleja el dominio del prompt (mapa, join, indicadores, color, factores).
- [ ] El Source produce indicadores con la clave canónica y `null` en los huecos.
- [ ] `data/bundle.js` regenerado y commiteado (el frontend lo carga embebido).
- [ ] `npm test` y `pytest` en verde.
- [ ] `index.html` abre y pinta el mapa sin errores de consola.
- [ ] No se ha tocado `src/engine/*`.

---

## Mapa de archivos

| Archivo | Rol | ¿Lo edita el agente? |
|---|---|---|
| `app.config.js` | Config declarativa del mapa | **Sí, siempre** |
| `scripts/sources/<dominio>.py` | Adaptador de datos | **Sí, siempre** (clonar ejemplo) |
| `src/adapters/domain.js` | Hooks `derive`/`simulate` | Solo si hay métrica derivada/simulador |
| `data/bundle.js` | Datos generados (`window.SSM_DATA`) | Generado por el pipeline |
| `src/engine/*.js` | Motor agnóstico | **No** |
| `src/app.js` | Cableado Leaflet/DOM | Raramente (solo UI nueva) |
| `index.html` | Shell zero-build | Raramente (estilos/estructura) |
