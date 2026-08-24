# Pruebas E2E

Tesela usa Playwright y Chromium para verificar el shell zero-build en un DOM y
navegador reales, sin depender de Leaflet, tiles o servicios externos durante el
test.

## Preparación

```bash
npm install
npx playwright install chromium
```

En Linux CI se instalan también las dependencias del navegador:

```bash
npx playwright install --with-deps chromium
```

## Ejecución

```bash
npm run test:e2e
```

La fixture carga los scripts clásicos en el mismo orden público que Tesela y usa
datos, mapa y provider deterministas. La suite cubre:

- arranque mediante HTTP y `file://`;
- búsqueda normalizada y Enter;
- ajuste de bounds y perímetro de selección;
- overlays y control de capas;
- detalle, glosario, avisos y metodología;
- actualización de presets sin perder selección;
- providers asíncronos y descarte de respuestas obsoletas;
- cleanup mediante `Tesela.app.destroy()`.

Los E2E no sustituyen el smoke manual con Leaflet y Wikimedia reales. Eliminan
la red de la suite para evitar falsos fallos y dejan esa comprobación externa
para la validación previa a publicar una release.
