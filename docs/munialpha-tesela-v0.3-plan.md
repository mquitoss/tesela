# Plan de desarrollo: Tesela v0.3.0 e integración en MuniAlpha

## 1. Objetivo

Publicar **Tesela v0.3.0** con las capacidades genéricas que MuniAlpha necesita y
migrar MuniAlpha para consumir esa versión como Git submodule, eliminando el
motor duplicado sin perder comportamiento, datos ni despliegue.

El resultado esperado es:

```text
Tesela
└── release/v0.3.0 + tag v0.3.0

MuniAlpha
├── vendor/tesela          # gitlink fijado a v0.3.0
├── app.config.js          # dominio inmobiliario
├── src/extensions/        # UI específica
├── scripts/sources/       # pipeline municipal
└── data/map_bundle.js     # generado fuera del submódulo
```

## 2. Situación inicial

### Tesela

- Versión publicada: `v0.2.0`.
- Motor zero-build con globals `Tesela` y aliases `SSM`.
- Validación de configuración, slots, mounts y locale.
- Pipeline compatible con Sources externos.
- Plantilla y documentación para Git submodules.
- Sistema de releases con rama y tag dedicados.

### MuniAlpha

- Tiene una copia evolucionada del motor original.
- Incluye funcionalidades todavía ausentes en Tesela:
  - scoring con cobertura mínima;
  - buscador;
  - selección perimetral;
  - overlays y etiquetas según zoom;
  - formatos `boolean` y `duration`;
  - detalle con secciones, avisos y glosario;
  - metodología;
  - fotografías asíncronas de Wikimedia Commons;
  - build estático para Cloudflare.
- Su bundle combina 947 geometrías con 947 indicadores y no debe duplicar los
  indicadores dentro de cada feature.

## 3. Principios de la migración

1. **Tesela permanece agnóstico al dominio.** No incorporará HUT, inversión,
   municipios catalanes ni fuentes específicas de MuniAlpha.
2. **MuniAlpha conserva su identidad.** Presets, metodología, alertas y textos
   legales permanecen en el proyecto host.
3. **Paridad antes de eliminación.** El motor local no se borra hasta demostrar
   igualdad de scores, cobertura y comportamiento visual.
4. **`null` sigue siendo ausencia.** Ninguna fase puede convertir huecos en cero.
5. **Submódulo inmutable.** MuniAlpha fijará el tag `v0.3.0` y commiteará el SHA
   del gitlink.
6. **Cambios pequeños y revisables.** Cada milestone se desarrolla en su propia
   rama, pasa tests y espera aprobación antes de merge.

## 4. Reparto de responsabilidades

| Capacidad | Tesela | MuniAlpha |
|---|---:|---:|
| Join por clave y normalización | Sí | Configura claves |
| Scoring, cobertura y diagnóstico | Sí | Configura factores/pesos |
| Buscador genérico | Sí | Proporciona nombres |
| Formatos comunes | Sí | Declara formatos/unidades |
| Contorno y overlays | Sí | Declara capas y estilos |
| Glosario y secciones | Sí | Proporciona definiciones |
| Providers asíncronos | Sí | Activa Wikimedia |
| Fotos de Wikimedia | Provider de referencia | Configura consulta/avisos |
| HUT y riesgo | No | Sí |
| Capitales comarcales concretas | No | Sí |
| Presets inmobiliarios | No | Sí |
| Fuentes de los 15 datasets | No | Sí |
| Bundle municipal | No | Sí |
| Despliegue de MuniAlpha | No | Sí |

## 5. Arquitectura objetivo de MuniAlpha

```text
muni-alpha/
├── .gitmodules
├── vendor/
│   └── tesela/                    # tag v0.3.0
├── app.config.js                  # TESELA_CONFIG
├── index.html
├── data/
│   └── map_bundle.js              # MUNIALPHA_DATA
├── scripts/
│   ├── build_static_site.js
│   └── sources/
│       └── munialpha.py
├── src/
│   ├── adapters/domain.js
│   ├── extensions/
│   │   ├── badges.js
│   │   ├── methodology.js
│   │   └── municipal-layers.js
│   └── styles.css
└── tests/
    ├── frontend/
    └── test_map_source.py
```

Los módulos genéricos se cargarán desde `vendor/tesela`. MuniAlpha no conservará
copias de `join`, `scoring`, `format`, `color`, `bundle` o `search` una vez
completada la migración.

---

# Parte A — Tesela v0.3.0

## Milestone T1 — Contratos y baseline de paridad

### Objetivo

Congelar el comportamiento de MuniAlpha que Tesela debe reproducir antes de mover
código.

### Tareas en MuniAlpha

- Generar fixtures deterministas de indicadores para casos completos, parciales
  y sin cobertura.
- Guardar para los siete presets:
  - score por municipio;
  - cobertura;
  - estado disponible/no disponible;
  - ranking superior;
  - hash estable de la matriz completa.
- Registrar tamaño y SHA-256 del bundle actual.
- Añadir casos de búsqueda con acentos, artículos y coincidencias parciales.
- Documentar el comportamiento de selección, zoom y overlays.

### Tareas en Tesela

- Convertir esos casos en tests agnósticos con ids y métricas neutrales.
- Definir contratos públicos antes de implementar:
  - resultado de scoring;
  - resultado de búsqueda;
  - descriptor de overlay;
  - descriptor de provider;
  - descriptor de campo de detalle.

### Criterios de aceptación

- Los fixtures no contienen términos inmobiliarios dentro de Tesela.
- El baseline puede detectar cualquier cambio de score o cobertura.
- Los hashes se generan de forma reproducible.

## Milestone T2 — Scoring con cobertura explicable

### API objetivo

```js
{
  key,
  score,
  scoreN,
  coverage,
  status,               // available | insufficient_coverage | missing_base
  contributions,
  missingFactors,
}
```

### Tareas

- Incorporar `minCoverage` configurable.
- Calcular cobertura mediante pesos activos, no por número bruto de factores.
- Excluir factores con peso cero del denominador.
- Mantener contribuciones ausentes como `null`, nunca cero semántico.
- Distinguir:
  - métrica base ausente;
  - cobertura ponderada insuficiente;
  - score disponible.
- Mantener compatibilidad con configs `baseMetric` de Tesela 0.2.
- Añadir helper para explicar factores presentes y ausentes.
- Añadir tests para pesos positivos, negativos, penalizaciones y todos los huecos.

### Criterios de aceptación

- Los fixtures de MuniAlpha producen scores y cobertura idénticos.
- No aparece `NaN` ni se imputa ningún valor.
- Una variación de pesos recalcula correctamente el denominador.

## Milestone T3 — Formato y búsqueda genéricos

### Formatos

Añadir al motor:

- `boolean` con etiquetas configurables;
- `duration` con horas/minutos;
- locale y marcador de hueco;
- unidad y decimales existentes.

Ejemplos de duración:

```text
45 min
1 h
1 h 35 min
```

### Búsqueda

- Extraer un módulo puro `search.js`.
- Normalizar acentos, artículos y espacios mediante la configuración de join.
- Priorizar coincidencias iniciales.
- Mantener orden estable por score y nombre.
- Añadir componente UI con resultados inmediatos y Enter para abrir el primero.
- Evitar que los resultados queden ocultos debajo de los controles.

### Criterios de aceptación

- Pasan los casos reales de nombres municipales.
- La búsqueda funciona sin DOM en tests unitarios y con DOM en smoke/E2E.
- Los textos son configurables y no están acoplados al español.

## Milestone T4 — Navegación y capas cartográficas

### Tareas

- Selección persistente mediante contorno GeoJSON no interactivo.
- Eliminar el rectángulo SVG conservando foco accesible por perímetro.
- Definir overlays declarativos:

```js
map: {
  overlays: [
    { id, label, type: "tile" | "markers", enabled },
  ],
}
```

- Etiquetas de zonas con:
  - `minZoom`;
  - filtrado por bounds;
  - clase y formatter configurables.
- Marcadores/puntos de referencia desde config o adapter.
- Control de capas reutilizable.
- Panes y orden visual explícitos.
- Limpiar listeners y capas al reconstruir el mapa.

### Criterios de aceptación

- Capitales y carreteras pueden expresarse sin modificar Tesela.
- Las etiquetas municipales solo aparecen desde el zoom configurado.
- Activar overlays no altera joins ni scoring.
- Selección, hover y foco son distinguibles.

## Milestone T5 — Detalle, glosario y metodología

### Tareas

- Soportar campos con `section`, `help`, formato y unidad.
- Soportar avisos declarativos después de los campos.
- Generar un glosario flotante accesible desde las definiciones.
- Añadir slots o componentes para metodología y procedencia.
- Gestionar foco, `aria-expanded`, `aria-controls` y Escape.
- Mantener los textos y el contenido en el proyecto consumidor.

### Criterios de aceptación

- MuniAlpha puede declarar todo su glosario desde config.
- El shell no contiene definiciones inmobiliarias.
- El panel funciona en escritorio y móvil.

## Milestone T6 — Providers asíncronos y Wikimedia Commons

### Contrato propuesto

```js
provider.load(context, { signal })
provider.normalize(response)
provider.attribution(item)
```

### Tareas

- Caché en memoria con tamaño máximo.
- `AbortController` al cambiar de zona.
- Token de petición para impedir respuestas obsoletas.
- Estados loading, vacío y error.
- Validación de URLs HTTPS.
- Renderizado mediante nodos de texto.
- Provider Wikimedia Commons:
  - búsqueda geográfica;
  - límite configurable;
  - filtro de mapas, logos, escudos y banderas;
  - eliminación de duplicados;
  - autor, licencia y enlace al original.

### Criterios de aceptación

- Cambiar rápidamente de municipio nunca mezcla fotografías.
- Un fallo de Commons no bloquea el detalle.
- La atribución permanece visible y enlazada.

## Milestone T7 — Pipeline y distribución para hosts

### Tareas

- Añadir opción:

```bash
--no-attach-indicators
```

- Mantener como default el comportamiento compatible actual.
- Permitir que el Source declare si necesita adjuntar indicadores a la geometría.
- Verificar tamaño máximo de assets y bundle.
- Incluir nuevos módulos en `tesela.assets.json` en el orden correcto.
- Actualizar plantilla de submódulo.
- Añadir build estático de referencia que copie únicamente assets públicos.
- Documentar inicialización del submódulo en CI.

### Criterios de aceptación

- El bundle de MuniAlpha no duplica indicadores.
- La salida conserva 947 geometrías y 947 indicadores.
- El bundle no aumenta de tamaño respecto al baseline más de un 5 %.
- El Source y output permanecen fuera del submódulo.

## Milestone T8 — E2E, release y publicación v0.3.0

### Validaciones

- Vitest del core y componentes.
- pytest, Ruff y mypy del pipeline.
- E2E para búsqueda, selección, overlays, detalle y provider.
- Smoke `file://` y HTTP.
- `npm audit` sin vulnerabilidades altas.
- Prueba de plantilla como proyecto host.

### Release

Después de aprobar todos los milestones:

```bash
npm run release -- 0.3.0 --dry-run
npm run release -- 0.3.0 --push
```

Debe publicar:

```text
main
release/v0.3.0
v0.3.0
GitHub Release Tesela v0.3.0
```

No se inicia la migración destructiva de MuniAlpha hasta que la release y su CI
estén verdes.

---

# Parte B — Integración de Tesela en MuniAlpha

## Milestone M1 — Añadir el submódulo

### Rama

```text
feat/tesela-submodule-v0.3
```

### Tareas

```bash
git submodule add https://github.com/mquitoss/tesela.git vendor/tesela
git -C vendor/tesela checkout v0.3.0
git add .gitmodules vendor/tesela
```

- Confirmar que `.gitmodules` usa URL HTTPS.
- Añadir comando de verificación del gitlink.
- Documentar clone con `--recurse-submodules`.
- Fallar con mensaje claro si `vendor/tesela/src` no está inicializado.
- Registrar la versión Tesela utilizada en metadatos o UI técnica.

### Criterios de aceptación

- El gitlink apunta al commit etiquetado `v0.3.0`.
- Un clone limpio puede inicializar y ejecutar tests.
- MuniAlpha todavía funciona con su motor local en esta fase.

## Milestone M2 — Migrar el pipeline del bundle

### Comando objetivo

```bash
python vendor/tesela/scripts/build_data.py \
  --source-path scripts/sources/munialpha.py \
  --project-root "$PWD" \
  --output data/map_bundle.js \
  --join-property CODIMUNI \
  --key-field municipality_code \
  --namespace MUNIALPHA_DATA \
  --decimals 5 \
  --no-attach-indicators
```

### Tareas

- Adaptar `Source` al contrato publicado de Tesela sin moverlo al submódulo.
- Mantener validación exacta de los 947 códigos.
- Trasladar tests de `build_map_data.py` al CLI común.
- Eliminar o reducir `scripts/build_map_data.py` a un wrapper fino.
- Comparar bundle anterior y nuevo:
  - claves;
  - `null`;
  - metadata;
  - tamaño;
  - hash determinista.

### Criterios de aceptación

- Join exacto `CODIMUNI` ↔ `municipality_code`.
- Códigos conservados como strings con ceros iniciales.
- Ningún indicador se copia dentro de `feature.properties`.
- Build reproducible en dos ejecuciones consecutivas.

## Milestone M3 — Migrar el motor, mantener el shell local

### Objetivo

Reducir riesgo sustituyendo primero funciones puras, sin cambiar todavía la UI.

### Tareas

- Actualizar `index.html` para cargar engine desde `vendor/tesela`.
- Migrar `SSM_CONFIG` a `TESELA_CONFIG`.
- Mantener `MUNIALPHA_DATA` como namespace del bundle.
- Eliminar copias locales cuando exista paridad:
  - `format.js`;
  - `geo.js`;
  - `join.js`;
  - `scoring.js`;
  - `color.js`;
  - `bundle.js`;
  - `search.js`;
  - `media.js`.
- Mantener temporalmente `src/app.js` de MuniAlpha.
- Cambiar tests para importar módulos desde el submódulo.

### Gate de paridad

- Scores idénticos para los siete presets.
- Cobertura idéntica para los 947 municipios.
- Mismos municipios excluidos.
- Mismo ranking superior.
- Mismos resultados de búsqueda.
- Mismos formatos visibles.

No se avanza si existe una diferencia no explicada.

## Milestone M4 — Migrar shell y extensiones de dominio

### Tareas

- Sustituir gradualmente `src/app.js` por el shell Tesela.
- Expresar desde config:
  - campos y secciones;
  - glosario;
  - avisos;
  - overlays;
  - etiquetas por zoom;
  - provider Wikimedia.
- Mover a extensiones de MuniAlpha:
  - badges HUT;
  - revisión de riesgo;
  - capitales comarcales;
  - metodología y enlaces propios;
  - cualquier comportamiento inmobiliario.
- Mantener `src/styles.css` como tema de MuniAlpha sobre Tesela.

### Criterios de aceptación

- Tesela no contiene referencias a Cataluña, HUT o inversión.
- MuniAlpha conserva todos los textos y alertas actuales.
- El shell local puede eliminarse completamente.

## Milestone M5 — Build estático y Cloudflare

### Tareas

- Actualizar `scripts/build_static_site.js` para copiar desde:

```text
vendor/tesela/src/engine/
vendor/tesela/src/ui/tesela.css
vendor/tesela/src/app.js
```

- Copiar también config, bundle, estilos y extensiones de MuniAlpha.
- Verificar que `dist/` no contenga `.git`, `.venv`, `node_modules` ni Sources.
- Inicializar el submódulo antes del build:

```bash
git submodule update --init --recursive
npm run build
```

- Actualizar Wrangler si cambia la estructura de assets.
- Ejecutar `wrangler deploy --dry-run`.
- Probar el despliegue automático de Cloudflare.

### Criterios de aceptación

- Cloudflare publica todos los assets del submódulo.
- Ningún asset supera 25 MiB.
- La primera carga y caché no empeoran significativamente.
- El mapa público funciona después de un clone limpio.

## Milestone M6 — Limpieza y release de MuniAlpha

### Tareas

- Eliminar código duplicado y wrappers transitorios.
- Actualizar README con inicialización del submódulo.
- Añadir comprobación de versión/tag Tesela en tests.
- Documentar cómo actualizar Tesela.
- Proponer MuniAlpha `v0.5.0` para la integración.
- Ejecutar revisión funcional y visual completa.

### Criterios de aceptación

- MuniAlpha no contiene copias del engine Tesela.
- Todos los tests y linters pasan.
- GitHub y Cloudflare están verdes.
- El repositorio puede clonarse y reconstruirse con instrucciones documentadas.

---

## 6. Estrategia de ramas y revisión

### Tesela

Ramas sugeridas:

```text
feat/scoring-coverage
feat/search-and-format
feat/map-overlays
feat/detail-components
feat/async-providers
feat/host-build-pipeline
```

Cada rama:

1. parte de `main`;
2. implementa un milestone coherente;
3. añade tests;
4. queda sin commit final hasta revisión funcional;
5. tras aprobación se integra a `main`.

La publicación final utiliza `release/v0.3.0` y `v0.3.0`.

### MuniAlpha

La migración puede realizarse en una rama larga
`feat/tesela-submodule-v0.3`, pero con commits pequeños por milestone después de
cada aprobación. No se mezcla con cambios de indicadores o metodología.

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Cambiar scores durante la extracción | Fixtures/hash de paridad y comparación de 947 municipios |
| Duplicar indicadores en geometría | `--no-attach-indicators` y test de propiedades |
| Submódulo ausente en Cloudflare | Inicialización explícita y fallo temprano del build |
| Rutas `file://` incorrectas | Smoke local con estructura final de `dist/` |
| Carreras en fotografías | AbortController, token de petición y tests |
| Acoplar Tesela a MuniAlpha | Fixtures neutrales y revisión de términos de dominio |
| Actualización accidental del submódulo | Pin por tag y commit del gitlink |
| Aumento del bundle | Presupuesto de tamaño y separación geometría/indicadores |
| Romper consumidores Tesela 0.2 | Tests de aliases y changelog de compatibilidad |

## 8. Matriz de validación final

| Área | Validación |
|---|---|
| Datos | 947 geometrías, 947 indicadores, claves exactas |
| Ausencias | `null` preservado; sin imputaciones |
| Scoring | Paridad completa por preset |
| Cobertura | Paridad por municipio y estado |
| Búsqueda | Acentos, artículos, Enter y foco |
| Mapa | Selección, overlays, zoom y etiquetas |
| Detalle | Campos, glosario, avisos y fotos |
| Accesibilidad | Teclado, foco, Escape y ARIA |
| Bundle | Reproducible y dentro del presupuesto |
| Submódulo | Gitlink en tag `v0.3.0` |
| Build | npm build y Wrangler dry-run |
| Despliegue | GitHub Actions y Cloudflare verdes |

## 9. Definición de terminado

La integración se considera completada cuando:

- Tesela `v0.3.0` está publicada con rama, tag y GitHub Release;
- MuniAlpha fija exactamente ese tag como submódulo;
- el motor duplicado se ha eliminado de MuniAlpha;
- scores, cobertura y ranking son idénticos al baseline;
- búsqueda, overlays, glosario y fotografías mantienen funcionalidad;
- el bundle conserva los 947 municipios sin duplicar indicadores;
- un clone con submódulos puede ejecutar tests, build y despliegue;
- Cloudflare sirve la nueva versión sin regresiones;
- documentación y proceso de actualización quedan operativos.
