# Migración de Self Service Map a Tesela 0.2

Tesela 0.2 cambia la identidad pública sin eliminar las APIs antiguas. La
migración puede hacerse de forma incremental.

## Globals

| Antes | Ahora |
|---|---|
| `window.SSM` | `window.Tesela` |
| `window.SSM_CONFIG` | `window.TESELA_CONFIG` |
| `window.SSM_DATA` | `window.TESELA_DATA` |

Durante la serie `0.x`, los nombres de cada fila apuntan al mismo objeto.

## Configuración

Cambia la exposición final:

```diff
- root.SSM_CONFIG = config;
+ root.TESELA_CONFIG = config;
+ root.SSM_CONFIG = config;
```

Actualiza también el namespace recomendado:

```diff
- dataNamespace: "SSM_DATA"
+ dataNamespace: "TESELA_DATA"
```

## Bundle

Regenera el bundle con Tesela:

```bash
python scripts/build_data.py --source <source>
```

El artefacto contiene `TESELA_DATA` y crea automáticamente el alias `SSM_DATA`.

## Scripts del navegador

Carga `namespace.js` antes de los demás módulos y añade validación/extensiones:

```html
<script src="src/engine/namespace.js"></script>
<script src="app.config.js"></script>
<script src="data/bundle.js"></script>
<!-- módulos existentes -->
<script src="src/engine/config.js"></script>
<script src="src/engine/extensions.js"></script>
```

## CSS y DOM

Los ids y clases `ssm-*` permanecen estables en Tesela 0.2. No es necesario
renombrarlos. El shell añade clases semánticas `tesela-*` a sus tres contenedores
principales para facilitar una migración posterior.

## Validación

Tesela comprueba claves duplicadas, factores y presets, tipos de join y rampas de
color. Una configuración antes tolerada puede mostrar ahora un error si era
ambigua o internamente inconsistente.

## Retirada futura

Los aliases `SSM_*` no se eliminarán antes de Tesela 1.0. La retirada se anunciará
en el changelog y tendrá una guía de migración específica.
