"""Pipeline base de Self Service Map: Source → bundle.js.

Orquesta un adaptador de fuente (``scripts/sources/<nombre>.py``) y emite
``data/bundle.js`` con ``window.SSM_DATA = {geo, indicators, meta}`` que el
frontend zero-build carga por ``<script src>``. El pipeline es AGNÓSTICO al
dominio: la geometría y los indicadores los produce el Source; aquí solo se
redondean coordenadas, se adjuntan los indicadores a las features (tooltips ricos)
y se serializa el bundle.

Uso:
    python scripts/build_data.py --source example_source
    python scripts/build_data.py --source example_source --data-dir data --namespace SSM_DATA

Las funciones de transformación son PURAS (sin IO/red) para poder testearlas; el
IO (fetch del Source, escritura del bundle) vive en ``main``/``construir``.
"""

from __future__ import annotations

import argparse
import importlib
import json
import re
import sys
import unicodedata
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Helpers PUROS (espejo de src/engine/join.js::normalizeName y de la limpieza geo)
# ---------------------------------------------------------------------------

_REGEX_ARTICLE = re.compile(r"^(?:els|les|el|la|l')\s*")
_REGEX_ESPACIOS = re.compile(r"\s+")


def normalize_name(value: Any) -> str:
    """Minúsculas, sin acentos, sin artículo inicial, espacios colapsados.

    Espejo de ``src/engine/join.js::normalizeName`` para que el fallback de join
    por nombre sea idéntico en build y en runtime.
    """
    if value is None:
        return ""
    text = unicodedata.normalize("NFKD", str(value))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = _REGEX_ESPACIOS.sub(" ", text.lower().strip())
    return _REGEX_ARTICLE.sub("", text).strip()


def round_coords(geojson: dict, decimals: int = 6) -> dict:
    """Redondea las coordenadas de un GeoJSON a ``decimals`` (reduce tamaño).

    Puro: devuelve una copia, no muta la entrada. Recorre Polygon y MultiPolygon.
    """

    def _round(coords: Any) -> Any:
        if isinstance(coords, (int, float)):
            return round(float(coords), decimals)
        if isinstance(coords, list):
            return [_round(c) for c in coords]
        return coords

    features = []
    for feat in geojson.get("features", []):
        geom = feat.get("geometry")
        new_geom = None
        if geom and "coordinates" in geom:
            new_geom = {**geom, "coordinates": _round(geom["coordinates"])}
        else:
            new_geom = geom
        features.append({**feat, "geometry": new_geom})
    return {**geojson, "features": features}


def attach_indicators_to_geometry(
    geojson: dict, indicators: list[dict], join_property: str, key_field: str
) -> dict:
    """Adjunta los valores del indicador a ``properties`` de cada feature.

    Empareja por la clave canónica (``properties[join_property]`` ↔
    ``indicator[key_field]``). Enriquece los tooltips/popups sin que el frontend
    dependa de ello (el frontend hace su propio join). Puro; no muta la entrada.
    """
    by_key = {ind.get(key_field): ind for ind in indicators if ind.get(key_field) is not None}
    features = []
    for feat in geojson.get("features", []):
        props = dict(feat.get("properties", {}))
        ind = by_key.get(props.get(join_property))
        if ind:
            for k, v in ind.items():
                if k not in (key_field,):
                    props.setdefault(k, v)
        features.append({**feat, "properties": props})
    return {**geojson, "features": features}


def build_meta(source_name: str, geojson: dict, indicators: list[dict], extra: dict | None = None) -> dict:
    """Metadatos de procedencia y cobertura del bundle (sin marcas de tiempo no
    deterministas; el Source puede añadir año/fuente vía ``extra``)."""
    with_data = sum(1 for ind in indicators if _has_any_value(ind))
    meta = {
        "source": source_name,
        "zonas": len(geojson.get("features", [])),
        "indicadores": len(indicators),
        "con_dato": with_data,
    }
    if extra:
        meta.update(extra)
    return meta


def _has_any_value(ind: dict) -> bool:
    for k, v in ind.items():
        if k in ("codi", "nom", "cusec"):
            continue
        if v is not None:
            return True
    return False


def emit_bundle_js(bundle: dict, path: Path, namespace: str = "SSM_DATA") -> None:
    """Serializa ``window.<namespace> = {...}`` a ``path`` (UTF-8, JSON compacto)."""
    payload = json.dumps(bundle, ensure_ascii=False, separators=(",", ":"))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"window.{namespace} = {payload};\n", encoding="utf-8")


# ---------------------------------------------------------------------------
# Orquestación (IO)
# ---------------------------------------------------------------------------


def load_source(name: str) -> Any:
    """Importa ``scripts/sources/<name>.py`` y devuelve una instancia de ``Source``."""
    module = importlib.import_module(f"sources.{name}")
    if not hasattr(module, "Source"):
        raise SystemExit(f"El adaptador '{name}' no define una clase Source.")
    return module.Source()


def construir(
    source_name: str,
    data_dir: Path,
    *,
    join_property: str = "BARRI",
    key_field: str = "codi",
    decimals: int = 6,
    namespace: str = "SSM_DATA",
) -> dict:
    """Construye el bundle desde un Source y lo escribe en ``data_dir/bundle.js``.

    Devuelve el bundle (útil para tests). Es el único punto con IO de red/disco.
    """
    source = load_source(source_name)
    geo = source.geometry()
    indicators = source.indicators()

    geo = round_coords(geo, decimals)
    geo = attach_indicators_to_geometry(geo, indicators, join_property, key_field)
    meta = build_meta(source_name, geo, indicators)

    bundle = {"geo": geo, "indicators": indicators, "meta": meta}
    emit_bundle_js(bundle, data_dir / "bundle.js", namespace)
    return bundle


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Construye data/bundle.js desde un Source.")
    parser.add_argument("--source", default="example_source", help="módulo en scripts/sources/")
    parser.add_argument("--data-dir", default="data", help="directorio de salida")
    parser.add_argument("--join-property", default="BARRI", help="propiedad de join en la geometría")
    parser.add_argument("--key-field", default="codi", help="campo clave en los indicadores")
    parser.add_argument("--decimals", type=int, default=6, help="decimales de las coordenadas")
    parser.add_argument("--namespace", default="SSM_DATA", help="global del bundle (window.<ns>)")
    args = parser.parse_args(argv)

    # Permitir `import sources.<name>` ejecutando desde la raíz del repo.
    sys.path.insert(0, str(Path(__file__).resolve().parent))

    bundle = construir(
        args.source,
        Path(args.data_dir),
        join_property=args.join_property,
        key_field=args.key_field,
        decimals=args.decimals,
        namespace=args.namespace,
    )
    meta = bundle["meta"]
    print(
        f"OK · {meta['zonas']} zonas, {meta['indicadores']} indicadores "
        f"({meta['con_dato']} con dato) → {args.data_dir}/bundle.js"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
