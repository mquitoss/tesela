"""Adaptador de ejemplo: densidad de población por barrio de Barcelona.

Dataset NEUTRO incluido de fábrica para que el framework arranque mostrando algo
real. Dos fuentes públicas:

- Geometría: ``martgnz/bcn-geodata`` (73 barris, CC-BY). Propiedad de join: ``BARRI``.
- Población: Open Data BCN, padró ``pad_mdbas_sexe`` (CSV agregado por barri).

Densidad = población / superficie (km², derivada del campo ``AREA`` en m² de la
geometría). Un barri sin población utilizable quedaría con ``densitat=None`` (hueco;
nunca se fabrica). Es la plantilla que un agente clona para su propio dominio.
"""

from __future__ import annotations

import csv
import io
import urllib.request

GEOMETRY_URL = (
    "https://raw.githubusercontent.com/martgnz/bcn-geodata/master/barris/barris.geojson"
)
# Padró municipal por sexo y barri (Open Data BCN). El recurso de 2025 es estable;
# se sigue la redirección de descarga (CKAN responde 200 tras un 302 inicial).
POPULATION_URL = (
    "https://opendata-ajuntament.barcelona.cat/data/dataset/"
    "16c11ddf-a783-4b64-aa68-3dc83dc70379/resource/"
    "30d95868-7968-4a26-bf9b-9eaee53b2e3f/download"
)
POPULATION_YEAR = 2025

# Propiedades de la geometría que conservamos (el resto es ruido cartográfico).
KEEP_PROPS = ("BARRI", "NOM", "AREA")


def _fetch(url: str, timeout: int = 60) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "self-service-map/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 (URL fija)
        return resp.read()


def _clean_feature_props(props: dict) -> dict:
    """Conserva solo BARRI (como int), NOM y AREA; descarta el resto."""
    out: dict = {}
    barri = props.get("BARRI")
    out["BARRI"] = int(barri) if barri not in (None, "", "-") else None
    out["NOM"] = props.get("NOM")
    area = props.get("AREA")
    out["AREA"] = float(area) if area not in (None, "", "-") else None
    return out


class Source:
    """Implementa el contrato ``scripts/sources/base.Source``."""

    def __init__(self) -> None:
        self._geo: dict | None = None

    # -- geometría -----------------------------------------------------------
    def geometry(self) -> dict:
        if self._geo is None:
            raw = _fetch(GEOMETRY_URL)
            fc = _decode_geojson(raw)
            features = []
            for feat in fc.get("features", []):
                features.append(
                    {
                        "type": "Feature",
                        "properties": _clean_feature_props(feat.get("properties", {})),
                        "geometry": feat.get("geometry"),
                    }
                )
            self._geo = {"type": "FeatureCollection", "features": features}
        return self._geo

    # -- indicadores ---------------------------------------------------------
    def indicators(self) -> list[dict]:
        geo = self.geometry()
        area_km2_by_codi = _area_km2_by_codi(geo)
        name_by_codi = {
            f["properties"]["BARRI"]: f["properties"].get("NOM")
            for f in geo["features"]
            if f["properties"].get("BARRI") is not None
        }
        poblacio_by_codi = self._population_by_codi()

        records: list[dict] = []
        for codi in sorted(name_by_codi):
            poblacio = poblacio_by_codi.get(codi)
            area_km2 = area_km2_by_codi.get(codi)
            densitat = compute_density(poblacio, area_km2)
            records.append(
                {
                    "codi": codi,
                    "nom": name_by_codi[codi],
                    "poblacio": poblacio,
                    "area_km2": round(area_km2, 4) if area_km2 is not None else None,
                    "densitat": round(densitat, 1) if densitat is not None else None,
                }
            )
        return records

    def _population_by_codi(self) -> dict[int, int]:
        raw = _fetch(POPULATION_URL)
        text = raw.decode("utf-8-sig", errors="replace")
        totals: dict[int, int] = {}
        for row in csv.DictReader(io.StringIO(text)):
            try:
                codi = int(row["Codi_Barri"])
                valor = int(row["Valor"])
            except (KeyError, ValueError, TypeError):
                continue
            totals[codi] = totals.get(codi, 0) + valor
        return totals


def _decode_geojson(raw: bytes) -> dict:
    import json

    return json.loads(raw.decode("utf-8-sig", errors="replace"))


def _area_km2_by_codi(geo: dict) -> dict[int, float]:
    out: dict[int, float] = {}
    for feat in geo.get("features", []):
        props = feat.get("properties", {})
        codi = props.get("BARRI")
        area = props.get("AREA")
        if codi is None or area in (None, 0):
            continue
        out[codi] = float(area) / 1_000_000.0  # m² → km²
    return out


def compute_density(poblacio: object, area_km2: object) -> float | None:
    """Densidad (hab/km²) = población / superficie. ``None`` si no es computable
    (población o área ausentes/no positivas). Un hueco NUNCA se fabrica."""
    try:
        p = float(poblacio)  # type: ignore[arg-type]
        a = float(area_km2)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    if p < 0 or a <= 0:
        return None
    return p / a
