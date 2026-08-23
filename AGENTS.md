# AGENTS.md — Personalización de Tesela desde un prompt

Tesela es un motor y shell base para crear mapas configurables sin empezar desde
cero. Un agente debe expresar el dominio mediante configuración y adaptadores,
preservando el núcleo reutilizable.

## Superficies de personalización

1. `app.config.js`: marca, UI, mapa, join, indicadores, scoring y detalle.
2. `scripts/sources/<dominio>.py`: adquisición y normalización de datos.
3. `src/adapters/domain.js`: métricas derivadas, simulación y slots de dominio.
4. `extensions.slots`: pequeños bloques visuales del shell.

No añadas nombres de métricas, fuentes o reglas de negocio a `src/engine/*`.

## Flujo recomendado

### 1. Configurar la aplicación

| Petición | Configuración |
|---|---|
| título, subtítulo y color | `branding` |
| locale y textos del shell | `ui.locale`, `ui.labels` |
| contenedores personalizados | `mounts` |
| centro, zoom y mapa base | `map` |
| unión geometría/datos | `join.property`, `join.keyField`, `join.type` |
| métricas visibles | `indicators` y `detail.fields` |
| coropleta | `color.metric`, `color.ramp`, `color.noData` |
| scoring y tesis | `scoring.factors`, `scoring.presets` |
| bloques UI adicionales | `extensions.slots` o `adapters.slots` |

La configuración se valida en runtime. No desactives la validación para ocultar
errores; corrige la ruta indicada.

### 2. Implementar el Source

Clona `scripts/sources/example_source.py` y devuelve un FeatureCollection y una
lista de indicadores. Todas las geometrías e indicadores deben tener claves
canónicas no nulas y únicas. Un indicador no puede apuntar a una geometría
inexistente.

```bash
python scripts/build_data.py \
  --source <dominio> \
  --join-property <PROPIEDAD_GEO> \
  --key-field <campo_indicador>
```

### 3. Añadir extensiones solo cuando sean necesarias

- `derive(indicator, config)`: métrica derivada pura.
- `simulate(params, config)`: API experimental; el shell no la representa aún.
- `slots`: UI adicional en posiciones declaradas.

Un slot recibe un snapshot de estado; no debe mutarlo. Devuelve nodos creados con
`document.createElement` y asigna contenido mediante `textContent`, nunca mediante
HTML de fuentes externas.

## Invariantes

- `null` es un hueco de primera clase y nunca se convierte en cero.
- La clave canónica tiene prioridad; el nombre solo puede ser fallback explícito.
- El motor no conoce el dominio.
- Los errores de datos se corrigen en el Source, no se silencian en la UI.
- Los namespaces recomendados son `Tesela`, `TESELA_CONFIG` y `TESELA_DATA`.
- Los aliases `SSM_*` existen solo para compatibilidad durante `0.x`.
- El modo zero-build y `file://` continúan soportados.

## Verificación obligatoria

```bash
npm test
python -m pytest
python scripts/build_data.py --source <dominio> \
  --join-property <PROPIEDAD_GEO> --key-field <campo_indicador>
```

Después abre `index.html` y comprueba mapa, tooltips, presets, sliders, detalle y
consola del navegador.

Si Tesela está montado como submódulo, el Source debe vivir en el host y el build
debe usar `--source-path`, `--project-root` y `--output`. Nunca escribas datos o
configuración de dominio dentro de `vendor/tesela`.

## Checklist

- [ ] La configuración valida sin errores.
- [ ] Las claves del Source son únicas y estables.
- [ ] Los huecos siguen siendo `null`.
- [ ] El bundle se expone como `TESELA_DATA`.
- [ ] La lógica de dominio vive fuera del engine.
- [ ] Los slots no usan `innerHTML` con contenido externo.
- [ ] Vitest y pytest están en verde.
- [ ] El ejemplo funciona mediante `file://`.

## Compatibilidad y APIs experimentales

Consulta `docs/migrating-from-ssm.md` antes de migrar un proyecto antiguo.
`levels`, `bbox` y `simulate` no deben tratarse aún como APIs completas.

## Releases

No edites una sola versión de forma aislada ni crees tags manualmente. Añade los
cambios a `[Unreleased]` y utiliza `npm run release -- <versión>`. El comando
sincroniza todos los ficheros, valida el repositorio y crea rama y tag dedicados.
Consulta `docs/releases.md`.
