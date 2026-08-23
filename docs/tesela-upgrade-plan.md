# Plan de actualización: Self Service Map → Tesela

## 1. Objetivo

Convertir el framework actual **Self Service Map 0.1.0** en **Tesela**, un motor y
shell reutilizable para construir aplicaciones cartográficas configurables a
partir de geometrías, indicadores y adaptadores de dominio.

La actualización debe conservar las fortalezas actuales:

- configuración declarativa;
- motor agnóstico al dominio;
- valores ausentes representados como `null`;
- joins mediante claves canónicas;
- funcionamiento sin transpilación y compatibilidad con `file://`;
- pipeline reproducible y tests sin red.

Al mismo tiempo debe incorporar lo aprendido en MuniAlpha: build de producción,
componentes UI extensibles, cobertura explicable, capas de orientación,
proveedores asíncronos, accesibilidad y pruebas en navegador.

## 2. Identidad y cambio de nombre

### 2.1 Nombre y relato

**Tesela** procede de la pieza individual que forma un mosaico. En el producto,
cada geometría, dataset, indicador y capa es una pieza que contribuye a construir
una lectura territorial completa.

Propuesta de descripción:

> Tesela combina geometrías, datos y capas para convertir información territorial
> fragmentada en mapas comprensibles.

### 2.2 Validaciones previas

Antes de publicar el nombre:

- comprobar disponibilidad de `tesela` y variantes en npm;
- comprobar organización y repositorios disponibles en GitHub;
- revisar dominios relevantes;
- realizar una búsqueda básica de marcas en las jurisdicciones objetivo;
- elegir el nombre de paquete definitivo si `tesela` no está disponible.

Nombres de paquete provisionales:

- `@tesela/core`;
- `@tesela/ui`;
- `@tesela/providers`;
- `@tesela/cli`.

Mientras el proyecto siga siendo un único paquete privado puede utilizarse
`tesela-map` como nombre técnico temporal.

### 2.3 Inventario de renombrado

| Actual | Destino | Estrategia |
|---|---|---|
| Self Service Map | Tesela | Sustitución en documentación y textos visibles |
| `self-service-map` | `tesela-map` o nombre npm aprobado | Cambio en `package.json` y lockfile |
| `window.SSM` | `window.Tesela` | Alias de compatibilidad durante la etapa pre-1.0 |
| `window.SSM_CONFIG` | `window.TESELA_CONFIG` | Leer primero el nombre nuevo y aceptar el anterior temporalmente |
| `window.SSM_DATA` | `window.TESELA_DATA` | Namespace configurable; mantener fallback antiguo |
| clases `ssm-*` | clases `tesela-*` | Migración progresiva o compatibilidad CSS durante una versión |
| referencias en README/AGENTS | Tesela | Actualización completa de ejemplos y diagramas |

No se eliminarán los aliases antiguos en la misma versión que introduce el nuevo
nombre. La eliminación se reservará para `1.0.0` y se documentará como cambio
incompatible.

## 3. Arquitectura objetivo

La separación objetivo es:

```text
src/
├── core/          joins, scoring, color, formato, bundle y cobertura
├── ui/            buscador, detalle, controles, leyendas y paneles
├── map/           Leaflet, selección, capas, etiquetas y navegación
├── providers/     datos o medios asíncronos, caché y fallbacks
└── adapters/      hooks específicos del dominio

scripts/
├── build_data.py
├── build_static_site.*
└── sources/
```

El primer paso puede conservar los ficheros UMD y el zero-build. La división en
paquetes npm solo se realizará cuando las fronteras entre módulos estén estables.

### 3.1 Capas conceptuales

1. **Tesela Core**: funciones puras, sin DOM ni Leaflet.
2. **Tesela Map**: representación geográfica y ciclo de vida de capas.
3. **Tesela UI**: shell visual dirigido por configuración.
4. **Tesela Providers**: integraciones externas opcionales.
5. **Tesela CLI**: validación, build y despliegue estático.

## 4. Plan por milestones

### Milestone 0 — Baseline y contrato de compatibilidad

**Objetivo:** congelar el comportamiento actual antes de reestructurarlo.

Tareas:

- documentar la API pública actual de config, bundle, Source y hooks;
- añadir fixtures representativos para joins, `null`, scoring y multinivel;
- registrar tamaño del bundle y tiempos de build como baseline;
- definir qué identificadores antiguos tendrán alias y hasta qué versión;
- establecer versionado semántico y changelog;
- añadir una decisión arquitectónica sobre compatibilidad `file://`.

Criterios de aceptación:

- la configuración y el ejemplo actuales quedan cubiertos por tests;
- existe una tabla explícita de compatibilidad;
- no cambia todavía el comportamiento del mapa.

### Milestone 1 — Cambio de nombre a Tesela

**Objetivo:** adoptar la nueva identidad sin romper proyectos existentes.

Tareas:

- actualizar `README.md`, `AGENTS.md`, `package.json`, cabeceras y textos visibles;
- incorporar la narrativa y terminología de Tesela;
- introducir globals y namespaces nuevos con fallback a `SSM_*`;
- actualizar el ejemplo a `TESELA_CONFIG` y `TESELA_DATA`;
- emitir advertencias de deprecación solo en modo desarrollo;
- añadir favicon, metadatos y versión visible del framework;
- crear `CHANGELOG.md` y guía `docs/migrating-from-ssm.md`.

Criterios de aceptación:

- un bundle antiguo abre correctamente mediante los aliases;
- un proyecto nuevo no necesita usar ningún identificador `SSM`;
- no quedan usos recomendados de la marca antigua; sus referencias se limitan a
  aliases, pruebas de compatibilidad, changelog y documentación de migración.

Versión propuesta: `0.2.0`.

### Milestone 2 — Configuración tipada y validación

**Objetivo:** detectar errores de configuración antes de abrir el mapa.

Tareas:

- definir un JSON Schema para branding, mapa, join, indicadores, scoring y detalle;
- añadir validación en build y una validación ligera en runtime;
- documentar valores por defecto y campos obligatorios;
- validar claves duplicadas, referencias a indicadores inexistentes y presets
  incompletos;
- generar tipos TypeScript para consumidores, aunque el runtime siga en JS;
- mostrar errores accionables con la ruta exacta del campo inválido.

Criterios de aceptación:

- configs inválidas fallan con mensajes legibles;
- todos los ejemplos validan contra el schema;
- la validación no requiere transpilación para ejecutar el mapa.

### Milestone 3 — Shell UI modular y slots de extensión

**Objetivo:** evitar que cada proyecto tenga que reescribir `src/app.js`.

Componentes reutilizables:

- buscador normalizado con resultados inmediatos y teclado;
- ranking y estado de cobertura;
- presets y controles de peso;
- panel de detalle;
- glosario generado desde definiciones de campos;
- sección de fuentes y metodología;
- leyendas de color y estados sin datos;
- gestión de foco, cierre con Escape y responsive.

API de extensiones propuesta:

```js
extensions: {
  sidebar: { beforeSearch: [], afterControls: [] },
  detail: { beforeFields: [], afterFields: [] },
  map: { overlays: [] },
}
```

Los slots recibirán estado de solo lectura y callbacks públicos; no deberán
acceder a variables internas de la aplicación.

Criterios de aceptación:

- el ejemplo base y MuniAlpha pueden expresarse sin bifurcar el shell;
- los componentes pueden probarse sin cargar Leaflet;
- todas las interacciones esenciales funcionan mediante teclado.

### Milestone 4 — Cobertura, ausencia y explicabilidad

**Objetivo:** hacer transparentes los motivos por los que una zona no tiene score.

Tareas:

- diferenciar `sin dato`, `dato no utilizable` y `cobertura insuficiente`;
- devolver desde scoring un diagnóstico estructurado por zona;
- mostrar factores disponibles, ausentes y contribuciones ponderadas;
- configurar cobertura mínima global o por preset;
- generar leyenda específica para estados sin score;
- impedir cualquier coerción silenciosa de `null` a cero;
- permitir exportar el diagnóstico para auditoría.

Criterios de aceptación:

- cada zona sin puntuación tiene un motivo legible y verificable;
- los cambios de pesos actualizan score, cobertura y explicación;
- los invariantes de `null` están cubiertos por tests de regresión.

### Milestone 5 — Capas cartográficas y navegación

**Objetivo:** ofrecer orientación y selección sin código específico.

Tareas:

- selección mediante contorno persistente;
- overlays configurables y control de capas;
- etiquetas de zonas condicionadas por zoom y viewport;
- puntos de referencia configurables;
- capas transparentes de nombres y vías;
- panes y z-index declarativos;
- hooks para ajustar bounds, zoom máximo y padding;
- estilos accesibles de hover, foco y selección.

Criterios de aceptación:

- no aparece el rectángulo de foco del SVG;
- las etiquetas no saturan el mapa en zooms bajos;
- activar o desactivar overlays no altera el scoring.

### Milestone 6 — Proveedores asíncronos

**Objetivo:** integrar medios o enriquecimientos sin contaminar el core.

Contrato propuesto:

```js
provider.load(context, { signal })
provider.normalize(response)
provider.attribution(item)
```

Tareas:

- caché en memoria con límite configurable;
- cancelación mediante `AbortController`;
- protección frente a respuestas obsoletas;
- loading, vacío y error como estados de primera clase;
- validación de URLs y renderizado seguro mediante nodos de texto;
- atribución y licencia obligatorias para proveedores de medios;
- adaptador de referencia para Wikimedia Commons.

Criterios de aceptación:

- cambiar rápidamente de zona nunca muestra datos de la selección anterior;
- un fallo externo no bloquea el mapa ni el detalle;
- ningún proveedor es obligatorio para usar Tesela.

### Milestone 7 — Build, despliegue y carga de datos

**Objetivo:** producir artefactos públicos mínimos y desplegables.

Tareas:

- comando oficial que genere `dist/` mediante una lista blanca de assets;
- validación de tamaño máximo por archivo;
- configuraciones documentadas para Cloudflare, Netlify y GitHub Pages;
- smoke test HTTP del artefacto generado;
- modos de datos `embedded`, `url` y `upload`;
- mantener el bundle JS para `file://`;
- añadir JSON/TopoJSON comprimido para despliegues web;
- separar geometrías e indicadores para mejorar caché;
- documentar Brotli/Gzip y políticas de caché.

Criterios de aceptación:

- `dist/` no contiene dependencias, tests ni entornos locales;
- el ejemplo despliega sin configuración manual frágil;
- el modo alojado reduce transferencia respecto al bundle inicial.

### Milestone 8 — Calidad, E2E y accesibilidad

**Objetivo:** verificar el producto en un navegador real.

Tareas:

- incorporar Playwright;
- probar búsqueda, selección, detalle, presets, sliders y overlays;
- probar layouts de escritorio y móvil;
- comprobar navegación completa por teclado;
- ejecutar checks básicos de accesibilidad;
- simular red lenta, respuesta vacía y error de proveedor;
- añadir presupuestos de tamaño y rendimiento al CI;
- ejecutar build y smoke test en cada pull request.

Criterios de aceptación:

- tests unitarios, pipeline, E2E y build pasan en CI;
- no hay errores críticos de accesibilidad;
- los fallos de red tienen cobertura automatizada.

### Milestone 9 — Documentación y referencia

**Objetivo:** permitir que una persona o agente cree un mapa sin leer el core.

Entregables:

- guía de inicio rápido;
- referencia completa de configuración;
- contrato de Source;
- guía para adapters y providers;
- recetas de despliegue;
- guía de migración desde Self Service Map;
- ejemplos single-level, multi-level, scoring y medios;
- proyecto MuniAlpha como caso de referencia avanzado;
- decisiones arquitectónicas registradas en `docs/adr/`.

## 5. Estrategia de versiones

| Versión | Contenido esperado |
|---|---|
| `0.2.0` | Nueva marca Tesela y aliases compatibles |
| `0.3.0` | Schema, validación y shell UI modular |
| `0.4.0` | Cobertura explicable y capas configurables |
| `0.5.0` | Providers y build de producción |
| `0.6.0` | Modos de datos optimizados y E2E completo |
| `1.0.0` | API estable; retirada documentada de aliases `SSM_*` |

Cada milestone debe producir cambios pequeños, tests y una migración explícita.
No se combinará una reescritura completa con el cambio de nombre.

## 6. Orden de ejecución recomendado

1. Baseline y tests de contrato.
2. Cambio de nombre compatible.
3. Schema de configuración.
4. Extracción del shell UI en componentes.
5. Diagnóstico de cobertura.
6. Capas cartográficas.
7. Providers asíncronos.
8. Build y formatos de datos alojados.
9. E2E, accesibilidad y documentación final.

Este orden reduce riesgo: primero protege el comportamiento, después cambia la
marca y finalmente amplía capacidades.

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Romper proyectos al renombrar globals | Aliases durante toda la etapa `0.x` y tests de compatibilidad |
| Perder la simplicidad zero-build | Mantener UMD/JS plano como distribución soportada |
| Convertir config en una API demasiado compleja | Defaults, schema, ejemplos y extensiones opcionales |
| Acoplar el core a Leaflet | Core puro; Leaflet permanece en la capa Map |
| Aumentar demasiado el bundle | Presupuestos de tamaño y módulos opcionales |
| Proveedores externos inestables | Caché, cancelación, fallback y aislamiento |
| Repetir lógica específica de MuniAlpha | Generalizar solo capacidades demostradas por al menos dos casos |

## 8. Fuera de alcance inicial

- editor visual no-code;
- backend multiusuario;
- almacenamiento de proyectos en la nube;
- autenticación y permisos;
- sustitución inmediata de Leaflet;
- publicación de todos los módulos como paquetes independientes antes de
  estabilizar sus contratos.

## 9. Definición de terminado para Tesela 1.0

Tesela podrá considerarse `1.0.0` cuando:

- la marca y los namespaces nuevos sean los únicos recomendados;
- la API pública esté documentada y versionada;
- config, bundles, adapters y providers tengan validación;
- el shell cubra búsqueda, detalle, scoring, glosario, metodología y capas;
- la ausencia y cobertura sean explicables;
- exista build reproducible para `file://` y hosting estático;
- unit tests, pytest, E2E y accesibilidad se ejecuten en CI;
- al menos dos proyectos de dominios distintos utilicen el framework sin
  modificar el core.
