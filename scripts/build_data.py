"""Pipeline base de Tesela: Source → bundle.js.

Orquesta un adaptador de fuente (``scripts/sources/<nombre>.py``) y emite
``data/bundle.js`` con ``window.TESELA_DATA = {geo, indicators, meta}`` que el
frontend zero-build carga por ``<script src>``. El pipeline es AGNÓSTICO al
dominio: la geometría y los indicadores los produce el Source; aquí solo se
redondean coordenadas, se adjuntan los indicadores a las features (tooltips ricos)
y se serializa el bundle.

Uso:
    python scripts/build_data.py --source example_source
    python scripts/build_data.py --source example_source --data-dir data --namespace TESELA_DATA
    python vendor/tesela/scripts/build_data.py --source-path scripts/source.py \
        --project-root . --output data/bundle.js --join-property ID --key-field id

Las funciones de transformación son PURAS (sin IO/red) para poder testearlas; el
IO (fetch del Source, escritura del bundle) vive en ``main``/``construir``.
"""

from __future__ import annotations

import argparse
import importlib
import importlib.util
import inspect
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
_JS_IDENTIFIER = re.compile(r"^[A-Za-z_$][A-Za-z0-9_$]*$")


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


def validate_source_data(
    geojson: dict, indicators: list[dict], join_property: str, key_field: str
) -> None:
    """Valida la forma y las claves del Source antes de publicar el bundle."""
    if not isinstance(geojson, dict) or geojson.get("type") != "FeatureCollection":
        raise ValueError("Source.geometry() debe devolver un FeatureCollection")
    features = geojson.get("features")
    if not isinstance(features, list) or not features:
        raise ValueError("Source.geometry() debe contener features")
    if not isinstance(indicators, list) or not indicators:
        raise ValueError("Source.indicators() debe devolver una lista no vacía")

    geo_keys = [feature.get("properties", {}).get(join_property) for feature in features]
    indicator_keys = [indicator.get(key_field) for indicator in indicators]
    if any(key is None for key in geo_keys):
        raise ValueError(f"Todas las geometrías deben tener properties.{join_property}")
    if any(key is None for key in indicator_keys):
        raise ValueError(f"Todos los indicadores deben tener {key_field}")
    if len(geo_keys) != len(set(geo_keys)):
        raise ValueError(f"La geometría contiene claves {join_property} duplicadas")
    if len(indicator_keys) != len(set(indicator_keys)):
        raise ValueError(f"Los indicadores contienen claves {key_field} duplicadas")
    unknown = set(indicator_keys) - set(geo_keys)
    if unknown:
        sample = sorted(unknown, key=str)[:5]
        raise ValueError(f"Hay indicadores sin geometría para las claves: {sample}")


def build_meta(
    source_name: str,
    geojson: dict,
    indicators: list[dict],
    extra: dict | None = None,
    identity_fields: tuple[str, ...] = ("codi", "nom", "cusec"),
) -> dict:
    """Metadatos de procedencia y cobertura del bundle (sin marcas de tiempo no
    deterministas; el Source puede añadir año/fuente vía ``extra``)."""
    with_data = sum(1 for ind in indicators if _has_any_value(ind, identity_fields))
    meta = {
        "source": source_name,
        "zonas": len(geojson.get("features", [])),
        "indicadores": len(indicators),
        "con_dato": with_data,
    }
    if extra:
        for key, value in extra.items():
            if key not in meta:
                meta[key] = value
    return meta


def _has_any_value(ind: dict, identity_fields: tuple[str, ...]) -> bool:
    for k, v in ind.items():
        if k in identity_fields:
            continue
        if v is not None:
            return True
    return False


def emit_bundle_js(bundle: dict, path: Path, namespace: str = "TESELA_DATA") -> None:
    """Serializa el bundle y publica los aliases Tesela/SSM compatibles."""
    if not _JS_IDENTIFIER.fullmatch(namespace):
        raise ValueError(f"Namespace JavaScript inválido: {namespace!r}")
    payload = json.dumps(bundle, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    lines = [f"window.{namespace} = {payload};"]
    if namespace != "TESELA_DATA":
        lines.append(f"window.TESELA_DATA = window.{namespace};")
    if namespace != "SSM_DATA":
        lines.append(f"window.SSM_DATA = window.{namespace};")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


# ---------------------------------------------------------------------------
# Orquestación (IO)
# ---------------------------------------------------------------------------


def _instantiate_source(module: Any, project_root: Path | None) -> Any:
    if not hasattr(module, "Source"):
        raise SystemExit("El adaptador no define una clase Source.")
    source_class = module.Source
    if project_root is not None:
        signature = inspect.signature(source_class)
        accepts_root = "project_root" in signature.parameters or any(
            parameter.kind is inspect.Parameter.VAR_KEYWORD
            for parameter in signature.parameters.values()
        )
        if accepts_root:
            return source_class(project_root=project_root)
    return source_class()


def load_source(
    name: str,
    *,
    source_path: Path | None = None,
    project_root: Path | None = None,
) -> Any:
    """Carga un Source incluido o un módulo externo situado en el proyecto host."""
    root = project_root.resolve() if project_root is not None else None
    if root is not None and str(root) not in sys.path:
        sys.path.insert(0, str(root))
    if source_path is None:
        module = importlib.import_module(f"sources.{name}")
        return _instantiate_source(module, root)

    path = source_path if source_path.is_absolute() else (root or Path.cwd()) / source_path
    path = path.resolve()
    if not path.is_file():
        raise SystemExit(f"No existe el adaptador externo: {path}")
    spec = importlib.util.spec_from_file_location(f"tesela_external_source_{path.stem}", path)
    if spec is None or spec.loader is None:
        raise SystemExit(f"No se puede importar el adaptador externo: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return _instantiate_source(module, root)


def resolve_output_path(
    data_dir: Path,
    *,
    output: Path | None = None,
    project_root: Path | None = None,
) -> Path:
    """Resuelve la salida en el proyecto host, nunca implícitamente en el submódulo."""
    root = project_root.resolve() if project_root is not None else Path.cwd()
    target = output if output is not None else data_dir / "bundle.js"
    return target if target.is_absolute() else root / target


def construir(
    source_name: str,
    data_dir: Path,
    *,
    join_property: str = "BARRI",
    key_field: str = "codi",
    decimals: int = 6,
    namespace: str = "TESELA_DATA",
    source_path: Path | None = None,
    project_root: Path | None = None,
    output: Path | None = None,
) -> dict:
    """Construye el bundle desde un Source y lo escribe en ``data_dir/bundle.js``.

    Devuelve el bundle (útil para tests). Es el único punto con IO de red/disco.
    """
    source = load_source(
        source_name,
        source_path=source_path,
        project_root=project_root,
    )
    geo = source.geometry()
    indicators = source.indicators()
    validate_source_data(geo, indicators, join_property, key_field)

    geo = round_coords(geo, decimals)
    geo = attach_indicators_to_geometry(geo, indicators, join_property, key_field)
    source_meta = source.metadata() if callable(getattr(source, "metadata", None)) else None
    source_label = source_path.stem if source_path is not None else source_name
    meta = build_meta(
        source_label,
        geo,
        indicators,
        source_meta,
        identity_fields=(key_field, "nom", "name"),
    )

    bundle = {"geo": geo, "indicators": indicators, "meta": meta}
    emit_bundle_js(
        bundle,
        resolve_output_path(data_dir, output=output, project_root=project_root),
        namespace,
    )
    return bundle


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Construye data/bundle.js desde un Source.")
    parser.add_argument("--source", default="example_source", help="módulo en scripts/sources/")
    parser.add_argument("--source-path", type=Path, help="módulo Source externo al submódulo")
    parser.add_argument("--project-root", type=Path, default=Path.cwd(), help="raíz del proyecto host")
    parser.add_argument("--data-dir", type=Path, default=Path("data"), help="directorio de salida")
    parser.add_argument("--output", type=Path, help="fichero bundle.js de salida")
    parser.add_argument("--join-property", default="BARRI", help="propiedad de join en la geometría")
    parser.add_argument("--key-field", default="codi", help="campo clave en los indicadores")
    parser.add_argument("--decimals", type=int, default=6, help="decimales de las coordenadas")
    parser.add_argument("--namespace", default="TESELA_DATA", help="global del bundle (window.<ns>)")
    args = parser.parse_args(argv)

    # Permitir `import sources.<name>` ejecutando desde la raíz del repo.
    sys.path.insert(0, str(Path(__file__).resolve().parent))

    bundle = construir(
        args.source,
        args.data_dir,
        join_property=args.join_property,
        key_field=args.key_field,
        decimals=args.decimals,
        namespace=args.namespace,
        source_path=args.source_path,
        project_root=args.project_root,
        output=args.output,
    )
    meta = bundle["meta"]
    print(
        f"OK · {meta['zonas']} zonas, {meta['indicadores']} indicadores "
        f"({meta['con_dato']} con dato) → "
        f"{resolve_output_path(args.data_dir, output=args.output, project_root=args.project_root)}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
