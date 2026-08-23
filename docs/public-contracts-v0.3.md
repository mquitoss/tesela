# Contratos públicos objetivo de Tesela 0.3

Este documento congela los contratos que implementarán los milestones de Tesela
0.3. Hasta que cada módulo se publique, su contrato es **objetivo** y no una
capacidad disponible en Tesela 0.2.

## Convenciones

- `null` representa ausencia. Se aceptan números finitos y cadenas que contienen
  un número; cadenas vacías, booleanos, `NaN` e infinitos son huecos.
- Las claves conservan su tipo de entrada.
- Los resultados alineados conservan el orden de entrada.
- Los ids de factores, presets, overlays y providers son únicos y no vacíos.
- Las APIs CommonJS también se publican en `Tesela.engine` en navegador.

## Scoring

```js
computeScores(indicators, weights, {
  factors,
  keyField,
  baseMetric,
  minCoverage,
})
```

Cada resultado tiene esta forma estable:

```js
{
  key,
  score,              // entero 0..100 o null
  scoreN,             // número 0..1 o null
  coverage,           // número 0..1 o null
  status,             // available | insufficient_coverage | missing_base
  contributions,      // objeto por factor o null
  missingFactors,     // ids de factores activos sin valor
}
```

Reglas:

1. Un peso finito mayor que cero activa el factor. Cero, negativos y valores no
   finitos lo desactivan.
2. La cobertura es `suma de pesos de factores con dato / suma de todos los pesos
   activos`. Los pesos se cuentan por su magnitud positiva. Los factores
   inactivos no aparecen en `missingFactors`.
3. Un factor min-max está disponible cuando contiene un número finito. Un penalty
   está disponible cuando contiene un booleano; `false` es un valor disponible.
4. Las contribuciones ausentes son `null`, nunca cero imputado.
5. Un registro sin `baseMetric` numérica tiene `status: "missing_base"`,
   `coverage: null`, scores y contribuciones `null`.
6. Cobertura inferior a `minCoverage`, o ausencia de pesos activos, produce
   `status: "insufficient_coverage"`, scores `null` y un objeto de contribuciones
   que permite explicar los huecos.
7. Un registro elegible con cobertura suficiente tiene `status: "available"`.
   Su total se divide por el peso disponible antes del min-max final.
8. `minCoverage` por defecto es cero. `baseMetric` sigue siendo opcional para
   compatibilidad con Tesela 0.2.

`explainScore(result, weights)` devuelve `{ status, coverage, presentFactors,
missingFactors }`. Solo considera presentes los factores con peso activo y una
contribución no nula.

## Búsqueda

```js
searchZones(zones, query, {
  nameFor,
  scoreFor,
  keyFor,
  locale,
  normalization,
})
```

- Devuelve las referencias originales de `zones`, en un array nuevo.
- Filtra por inclusión del texto normalizado.
- Ordena por coincidencia inicial, score descendente, nombre según `locale`, clave
  canónica y, finalmente, posición original.
- Un query vacío devuelve todas las zonas ordenadas.
- La normalización reutiliza las opciones de `join.nameNormalization`.
- Scores ausentes o no finitos se ordenan al final. Un locale inválido cae a
  `en`, para que la búsqueda nunca lance.

## Overlays

Todos los overlays comparten:

```js
{ id, label, type, enabled?, pane?, minZoom?, maxZoom?, interactive? }
```

Un overlay `tile` añade `{ url, attribution?, options? }`. Un overlay `markers`
añade `{ items, pointFor, labelFor?, style? }`; los callbacks pertenecen a la
configuración JavaScript, no a datos externos. Reconstruir el mapa debe retirar
capas y listeners anteriores. Los ids duplicados son un error de configuración.

`items` puede ser un array o una función síncrona que recibe
`{ L, map, config, zones, overlay }`. `pointFor` devuelve `[lat, lng]`,
`{ lat, lng }` o `{ lat, lon }`; si se omite, Tesela lee esas propiedades del
item. Coordenadas vacías, booleanas, no finitas o fuera del mundo se descartan.
`labelFor` y `formatter` devuelven texto, nunca HTML externo.

Varios overlays pueden compartir un toggle mediante:

```js
control: { id: "context", label: "Reference layers" }
```

Los miembros de un grupo deben declarar el mismo label y estado inicial.
`map.labels` ofrece una capa de nombres independiente con `minZoom`, `maxZoom`,
`boundsPadding`, items y callbacks equivalentes. Si no define `pointFor`, usa el
punto representativo de la geometría de la zona.

`map.selection` dibuja un único perímetro no interactivo. Seleccionar otra zona
lo sustituye y refrescar estilos no lo elimina. `map.panes` fija nombre, z-index y
eventos de puntero; `map.layerControl` configura el control Leaflet.

El componente `Tesela.ui.createMapLayerManager` expone `rebuild`,
`refreshZoneStyles`, `refreshLabels`, `setSelection`, `focusZone` y `destroy`.
Reconstruir o destruir retira listeners, controles y capas anteriores; `destroy`
es idempotente.

## Providers asíncronos

```js
{
  id,
  load(context, { signal }),
  normalize(response),
  attribution(item),
  cacheKey?(context),
}
```

- `load` puede devolver una promesa con datos crudos y debe respetar abortos.
- `normalize` devuelve un array, de forma síncrona o asíncrona.
- `attribution` devuelve `{ label, url }` y las URLs públicas deben ser HTTPS.
- Abortos no son errores visibles. Error, vacío y loading son estados distintos.
- El runtime usa un token además de `AbortController` para descartar respuestas
  obsoletas y limita el tamaño de la caché.

## Campos de detalle

```js
{
  key,
  label,
  section?,
  help?,
  format?,
  decimals?,
  unit?,
  sinDato?,
  booleanLabels?,
  durationLabels?,
}
```

`key` y `label` son obligatorios. `format` admite `plain`, `number`, `percent`,
`boolean` y `duration`. `sinDato` permanece durante la serie 0.x. Secciones y
ayudas son contenido del host y se insertan como texto, no como HTML externo.
`boolean` solo acepta booleanos reales y usa etiquetas configurables, con
`true`/`false` como fallback neutral. `duration` recibe minutos no negativos,
redondea al minuto y admite etiquetas `{ hour, minute }`, con `h`/`min` como
fallback.

Un campo con `section` inicia una sección que incluye los campos siguientes
hasta el próximo descriptor con `section`. `help` aporta la definición del
campo al glosario; no se mantiene una segunda lista de definiciones.

El detalle admite contenido textual del host:

```js
detail: {
  closeLabel,
  fields,
  notices: ["..."],
  glossary: {
    enabled,
    triggerLabel,
    eyebrow?,
    title,
    intro?,
    closeLabel,
  },
}
```

Los avisos aparecen después de los campos. El glosario solo incluye campos con
`help`, se abre como diálogo no modal y sincroniza `aria-hidden`, `inert`,
`aria-expanded`, foco y Escape. Escape cierra primero el glosario y después el
detalle. Los textos se insertan como texto, nunca como HTML declarativo.

La procedencia se declara fuera del detalle:

```js
methodology: {
  enabled,
  label,
  summary?,
  sourcesLabel?,
  sources: [{ name, role }],
  stepsLabel?,
  steps: ["..."],
  links: [{ label, url }],
}
```

Tesela la representa mediante `<details>`. Los enlaces deben ser HTTPS. Todo el
contenido pertenece al host; el motor solo aporta estructura, validación y
accesibilidad. `Tesela.ui.createDetailController` expone `open`, `close`,
`openGlossary`, `closeGlossary` y `destroy`.

## Serialización de fixtures

Los fixtures de paridad se serializan como JSON UTF-8 compacto. Arrays tienen
orden contractual y las claves de objetos se recorren en el orden declarado por
el schema. Los hashes son SHA-256 del `JSON.stringify` de la matriz indicada; no
incluyen timestamps, rutas, locale del sistema, `NaN`, `Infinity` ni `undefined`.
