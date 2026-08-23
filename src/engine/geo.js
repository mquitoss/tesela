/* =====================================================================
   Tesela · engine/geo — helpers geométricos PUROS
   =====================================================================
   Lectura de claves de un feature GeoJSON (clave de join + nombre), centroide
   representativo, distancia haversine, conteo por radio y point-in-polygon. Todo
   agnóstico al dominio: las propiedades de join se reciben por parámetro (no se
   hardcodea `BARRI`/`CUSEC`). Sin DOM, sin Leaflet, sin red.

   CONVENCIÓN DE COORDENADAS: los puntos son {lat, lng} en grados; se acepta `lon`
   como alias de `lng`. La geometría GeoJSON usa pares [lng, lat]. El radio en m.
   ===================================================================== */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  const g = root.Tesela || root.SSM || {};
  root.Tesela = root.SSM = g;
  g.engine = Object.assign(g.engine || {}, api);
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const EARTH_RADIUS_M = 6371000; // radio medio de la Tierra (esfera), en metros

  /**
   * Extrae la clave de join de un feature desde `properties[property]`.
   * Si `type === "number"` la coacciona a número (null si no es finito); en otro
   * caso devuelve el string crudo. Null si la propiedad no existe o está vacía.
   * @param {{properties?:Record<string, unknown>}|null|undefined} feature
   * @param {string} property
   * @param {"number"|"string"} [type="string"]
   * @returns {number|string|null}
   */
  function keyFromFeature(feature, property, type) {
    const raw =
      feature && feature.properties ? feature.properties[property] : undefined;
    if (raw == null || raw === "") return null;
    if (type === "number") {
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    }
    return String(raw);
  }

  /**
   * Nombre legible de un feature: prueba `nameProperty` y luego respaldos
   * habituales (NOM/nom/name). Devuelve "" si no hay ninguno.
   * @param {{properties?:Record<string, unknown>}|null|undefined} feature
   * @param {string} [nameProperty="NOM"]
   * @returns {string}
   */
  function nameFromFeature(feature, nameProperty) {
    const props = (feature && feature.properties) || {};
    const keys = [nameProperty || "NOM", "NOM", "nom", "name"];
    for (const k of keys) {
      if (k && props[k] != null && props[k] !== "") return String(props[k]);
    }
    return "";
  }

  // Latitud/longitud de un punto admitiendo {lat, lng} o {lat, lon}. Null-safe.
  function lngOf(point) {
    if (point == null) return undefined;
    return point.lng != null ? point.lng : point.lon;
  }

  /**
   * Distancia haversine en METROS entre dos puntos {lat, lng} (o {lat, lon}).
   * Devuelve siempre un número finito no negativo (0 para puntos idénticos).
   * @param {{lat:number, lng?:number, lon?:number}} a
   * @param {{lat:number, lng?:number, lon?:number}} b
   * @returns {number}
   */
  function distanceMeters(a, b) {
    const lat1 = Number(a.lat);
    const lat2 = Number(b.lat);
    const lon1 = Number(lngOf(a));
    const lon2 = Number(lngOf(b));
    const toRad = Math.PI / 180;
    const dLat = (lat2 - lat1) * toRad;
    const dLon = (lon2 - lon1) * toRad;
    const sinLat = Math.sin(dLat / 2);
    const sinLon = Math.sin(dLon / 2);
    const h =
      sinLat * sinLat +
      Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * sinLon * sinLon;
    const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    return EARTH_RADIUS_M * c;
  }

  // Acumula sumas de lng/lat y conteo de vértices del anillo EXTERIOR (índice 0),
  // excluyendo el vértice de cierre duplicado (último == primero).
  function accumulateRing(ring, acc) {
    if (!Array.isArray(ring) || ring.length === 0) return;
    const closes =
      ring.length > 1 &&
      ring[0][0] === ring[ring.length - 1][0] &&
      ring[0][1] === ring[ring.length - 1][1];
    const last = closes ? ring.length - 1 : ring.length;
    for (let i = 0; i < last; i++) {
      const pair = ring[i];
      if (!Array.isArray(pair)) continue;
      const lng = Number(pair[0]);
      const lat = Number(pair[1]);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
      acc.sumLng += lng;
      acc.sumLat += lat;
      acc.n += 1;
    }
  }

  /**
   * Punto representativo (centroide) de un feature GeoJSON como {lat, lng}:
   * promedio de los vértices de los anillos EXTERIORES (Polygon y MultiPolygon).
   * Devuelve null si no hay geometría usable. Puro: no muta el feature.
   * @param {{geometry?:{type?:string, coordinates?:unknown}}|null|undefined} feature
   * @returns {{lat:number, lng:number}|null}
   */
  function representativePoint(feature) {
    const geom = feature && feature.geometry ? feature.geometry : null;
    if (!geom) return null;
    const polys =
      geom.type === "Polygon"
        ? [geom.coordinates]
        : geom.type === "MultiPolygon"
          ? geom.coordinates
          : [];
    const acc = { sumLng: 0, sumLat: 0, n: 0 };
    for (const poly of polys) {
      if (!Array.isArray(poly) || poly.length === 0) continue;
      accumulateRing(poly[0], acc); // solo el anillo exterior de cada polígono
    }
    if (acc.n === 0) return null;
    return { lat: acc.sumLat / acc.n, lng: acc.sumLng / acc.n };
  }

  /**
   * Cuenta puntos dentro de R metros de `point`. Cada punto es {lat, lng} o
   * {lat, lon}; los que no tengan coordenadas finitas se ignoran. Borde inclusivo.
   * @param {{lat:number, lng?:number, lon?:number}|null} point
   * @param {ReadonlyArray<{lat:number, lng?:number, lon?:number}>} points
   * @param {number} radiusMeters
   * @returns {number}
   */
  function countWithinRadius(point, points, radiusMeters) {
    if (point == null || !Array.isArray(points) || !(radiusMeters >= 0)) return 0;
    let count = 0;
    for (const p of points) {
      if (p == null) continue;
      const lat = Number(p.lat);
      const lng = Number(lngOf(p));
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      if (distanceMeters(point, p) <= radiusMeters) count += 1;
    }
    return count;
  }

  // Ray casting sobre un anillo [[lng,lat],...]: ¿está {lat,lng} dentro?
  function pointInRing(point, ring) {
    if (!Array.isArray(ring)) return false;
    const x = Number(lngOf(point));
    const y = Number(point.lat);
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = Number(ring[i][0]);
      const yi = Number(ring[i][1]);
      const xj = Number(ring[j][0]);
      const yj = Number(ring[j][1]);
      const intersects =
        yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (intersects) inside = !inside;
    }
    return inside;
  }

  /**
   * ¿Está el punto {lat, lng} dentro del feature (Polygon/MultiPolygon)?
   * Considera el anillo exterior y descuenta los agujeros (anillos interiores).
   * Puro; devuelve false ante geometría inutilizable.
   * @param {{lat:number, lng?:number, lon?:number}|null} point
   * @param {{geometry?:{type?:string, coordinates?:unknown}}|null|undefined} feature
   * @returns {boolean}
   */
  function pointInPolygon(point, feature) {
    if (point == null) return false;
    const geom = feature && feature.geometry ? feature.geometry : null;
    if (!geom) return false;
    const polys =
      geom.type === "Polygon"
        ? [geom.coordinates]
        : geom.type === "MultiPolygon"
          ? geom.coordinates
          : [];
    for (const poly of polys) {
      if (!Array.isArray(poly) || poly.length === 0) continue;
      if (!pointInRing(point, poly[0])) continue; // fuera del exterior
      let inHole = false;
      for (let h = 1; h < poly.length; h++) {
        if (pointInRing(point, poly[h])) {
          inHole = true;
          break;
        }
      }
      if (!inHole) return true;
    }
    return false;
  }

  return {
    EARTH_RADIUS_M,
    keyFromFeature,
    nameFromFeature,
    distanceMeters,
    representativePoint,
    countWithinRadius,
    pointInPolygon,
  };
});
