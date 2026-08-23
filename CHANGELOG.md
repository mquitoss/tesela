# Changelog

## 0.2.0 — sin publicar

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

### Cambiado

- El bundle predeterminado se publica como `TESELA_DATA`.
- Vitest se actualiza a una versión sin vulnerabilidades conocidas.
- El shell elimina inserciones de HTML para los errores de arranque.

### Compatibilidad

- `window.SSM`, `window.SSM_CONFIG` y `window.SSM_DATA` continúan disponibles
  durante la serie `0.x`.
