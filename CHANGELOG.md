# Changelog

## [Unreleased]

### Añadido

- Contratos públicos objetivo y fixtures neutrales de paridad para Tesela 0.3.
- Scoring con cobertura ponderada, estados explícitos y diagnóstico de factores
  ausentes.
- Búsqueda estable y configurable de zonas, integrada en el shell sin backend.
- Formatos `boolean` y `duration` con etiquetas localizables.
- Selección persistente, panes, overlays tile/markers, etiquetas por zoom y
  control de capas declarativos.
- Gestor Leaflet con reconstrucción y cleanup idempotentes.
- Detalle seccionado, avisos, glosario derivado y metodología declarativa.
- Cierre accesible con `inert`, estados ARIA, Escape y restauración de foco.
- Runtime de providers con AbortController, protección contra respuestas
  obsoletas, estados explícitos y caché LRU limitada.
- Provider reutilizable de Wikimedia Commons con filtros, autoría y licencia.
- Pipeline compacto mediante `--no-attach-indicators` o configuración del Source,
  conservando el comportamiento 0.2 por defecto.
- Build estático y workflow de referencia para hosts con submódulo, allowlist de
  assets, límite de tamaño y fallo temprano.
- E2E reales en Chromium para búsqueda, selección, overlays, detalle, providers,
  HTTP y `file://`.

### Corregido

- La normalización de artículos ya no elimina prefijos que solo coinciden con el
  inicio de una palabra.

## [0.2.0] - 2026-08-23

### Añadido

- Marca y namespaces públicos de Tesela.
- Compatibilidad bidireccional con globals `SSM_*`.
- Validación pura de configuración.
- Slots de UI para sidebar y detalle.
- Locale, textos, sliders y mounts configurables.
- Validación de claves y Source en el pipeline.
- Soporte de bundles multinivel como fuente embebida experimental.
- Guía de migración y plan de evolución.
- CSS público extraído y manifiesto ordenado de assets.
- Pipeline compatible con Sources externos y salidas en un proyecto host.
- Plantilla y guía para consumir Tesela como Git submodule.
- Release CLI con sincronización de versiones, validaciones, rama dedicada y tag.
- Workflow que publica automáticamente el GitHub Release al recibir un tag.

### Cambiado

- El bundle predeterminado se publica como `TESELA_DATA`.
- Vitest se actualiza a una versión sin vulnerabilidades conocidas.
- El shell elimina inserciones de HTML para los errores de arranque.

### Compatibilidad

- `window.SSM`, `window.SSM_CONFIG` y `window.SSM_DATA` continúan disponibles
  durante la serie `0.x`.
