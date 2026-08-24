"""Tests del pipeline base (build_data.py) y del adaptador de ejemplo.

Sin red: el Source de ejemplo se prueba con un fake que implementa el mismo
contrato, y las funciones puras del pipeline se prueban directamente.
"""

from __future__ import annotations

import json
from pathlib import Path

import build_data
import pytest
from sources.example_source import compute_density

# --- helpers puros del pipeline --------------------------------------------


def test_normalize_name_mirrors_frontend():
    assert build_data.normalize_name("el Raval") == "raval"
    assert build_data.normalize_name("Gràcia") == "gracia"
    assert build_data.normalize_name("la  Barceloneta") == "barceloneta"
    assert build_data.normalize_name("lake") == "lake"
    assert build_data.normalize_name(None) == ""


def test_round_coords_reduces_precision_without_mutating():
    geo = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {"BARRI": 1},
                "geometry": {"type": "Polygon", "coordinates": [[[2.123456789, 41.987654321]]]},
            }
        ],
    }
    out = build_data.round_coords(geo, decimals=4)
    assert out["features"][0]["geometry"]["coordinates"] == [[[2.1235, 41.9877]]]
    # No muta la entrada.
    assert geo["features"][0]["geometry"]["coordinates"] == [[[2.123456789, 41.987654321]]]


def test_attach_indicators_to_geometry():
    geo = {
        "type": "FeatureCollection",
        "features": [{"type": "Feature", "properties": {"BARRI": 1}, "geometry": None}],
    }
    inds = [{"codi": 1, "nom": "Raval", "densitat": 42.0}]
    out = build_data.attach_indicators_to_geometry(geo, inds, "BARRI", "codi")
    props = out["features"][0]["properties"]
    assert props["densitat"] == 42.0
    assert props["nom"] == "Raval"
    # La clave de join no se duplica como dato.
    assert "codi" not in props


def test_build_meta_counts_zones_and_data():
    geo = {"features": [{}, {}]}
    inds = [{"codi": 1, "densitat": 10.0}, {"codi": 2, "densitat": None}]
    meta = build_data.build_meta("example_source", geo, inds)
    assert meta["zonas"] == 2
    assert meta["indicadores"] == 2
    assert meta["con_dato"] == 1  # el segundo es todo huecos
    assert build_data.build_meta("canonical", geo, inds, {"source": "override"})["source"] == "canonical"


def test_emit_bundle_js_writes_namespaced_global_and_compatibility_alias(tmp_path):
    bundle = {"geo": {"type": "FeatureCollection", "features": []}, "indicators": [], "meta": {}}
    out = tmp_path / "bundle.js"
    build_data.emit_bundle_js(bundle, out, namespace="SSM_DATA")
    text = out.read_text(encoding="utf-8")
    assert text.startswith("window.SSM_DATA = ")
    first_line = text.splitlines()[0]
    payload = json.loads(first_line[len("window.SSM_DATA = ") : -1])
    assert "geo" in payload and "indicators" in payload
    assert "window.TESELA_DATA = window.SSM_DATA;" in text


def test_emit_bundle_js_uses_tesela_by_default_and_rejects_unsafe_namespace(tmp_path):
    bundle = {"geo": {}, "indicators": []}
    out = tmp_path / "bundle.js"
    build_data.emit_bundle_js(bundle, out)
    text = out.read_text(encoding="utf-8")
    assert text.startswith("window.TESELA_DATA = ")
    assert "window.SSM_DATA = window.TESELA_DATA;" in text
    with pytest.raises(ValueError, match="Namespace JavaScript inválido"):
        build_data.emit_bundle_js(bundle, out, namespace="bad;alert(1)")
    with pytest.raises(ValueError, match="Out of range float"):
        build_data.emit_bundle_js({"value": float("nan")}, out)


def test_validate_source_data_rejects_duplicate_indicator_keys():
    geo = {
        "type": "FeatureCollection",
        "features": [{"properties": {"ID": "1"}, "geometry": None}],
    }
    with pytest.raises(ValueError, match="duplicadas"):
        build_data.validate_source_data(geo, [{"id": "1"}, {"id": "1"}], "ID", "id")


def test_external_source_builds_into_host_project(tmp_path):
    host = tmp_path / "host"
    host.mkdir()
    source_path = host / "municipal_source.py"
    source_path.write_text(
        """
class Source:
    def __init__(self, project_root):
        self.project_root = project_root

    def geometry(self):
        return {
            "type": "FeatureCollection",
            "features": [{"type": "Feature", "properties": {"ID": "001"}, "geometry": None}],
        }

    def indicators(self):
        return [{"id": "001", "value": 42}]

    def metadata(self):
        return {"project_root": str(self.project_root)}
""".lstrip(),
        encoding="utf-8",
    )

    bundle = build_data.construir(
        "external",
        Path("data"),
        join_property="ID",
        key_field="id",
        source_path=Path("municipal_source.py"),
        project_root=host,
        output=Path("public/map-data.js"),
    )

    output = host / "public/map-data.js"
    assert output.exists()
    assert output.read_text(encoding="utf-8").startswith("window.TESELA_DATA = ")
    assert bundle["meta"]["source"] == "municipal_source"
    assert bundle["meta"]["project_root"] == str(host)


# --- adaptador de ejemplo: densidad ----------------------------------------


def test_compute_density_basic():
    assert compute_density(1000, 2.0) == 500.0


def test_compute_density_is_none_for_holes():
    assert compute_density(None, 2.0) is None
    assert compute_density(1000, 0) is None  # área no positiva
    assert compute_density(1000, None) is None
    assert compute_density("x", 2.0) is None


# --- orquestación con un Source falso (sin red) ----------------------------


class FakeSource:
    """Source de prueba que respeta el contrato sin tocar la red."""

    def geometry(self) -> dict:
        return {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {"BARRI": 1, "NOM": "el Raval", "AREA": 1_000_000.0},
                    "geometry": {"type": "Polygon", "coordinates": [[[2.0, 41.0], [2.0, 41.1], [2.1, 41.1], [2.0, 41.0]]]},
                }
            ],
        }

    def indicators(self) -> list[dict]:
        return [{"codi": 1, "nom": "el Raval", "poblacio": 50000, "area_km2": 1.0, "densitat": 50000.0}]

    def metadata(self) -> dict:
        return {"license": "CC0", "reference_period": "2025"}


class CompactSource(FakeSource):
    attach_indicators = False


class InvalidAttachSource(FakeSource):
    attach_indicators = "no"


def test_construir_emits_valid_bundle(tmp_path, monkeypatch):
    monkeypatch.setattr(build_data, "load_source", lambda name, **kwargs: FakeSource())
    bundle = build_data.construir("fake", tmp_path)
    assert (tmp_path / "bundle.js").exists()
    assert bundle["meta"]["zonas"] == 1
    assert bundle["meta"]["con_dato"] == 1
    assert bundle["meta"]["license"] == "CC0"
    # La densidad llega a las properties de la feature (tooltip rico).
    assert bundle["geo"]["features"][0]["properties"]["densitat"] == 50000.0


def test_source_can_keep_indicators_separate(tmp_path, monkeypatch):
    monkeypatch.setattr(build_data, "load_source", lambda name, **kwargs: CompactSource())
    bundle = build_data.construir("compact", tmp_path)
    assert bundle["geo"]["features"][0]["properties"] == {
        "BARRI": 1,
        "NOM": "el Raval",
        "AREA": 1_000_000.0,
    }
    assert bundle["indicators"][0]["densitat"] == 50000.0


def test_cli_option_overrides_legacy_attachment(tmp_path, monkeypatch):
    monkeypatch.setattr(build_data, "load_source", lambda name, **kwargs: FakeSource())
    assert build_data.main([
        "--project-root", str(tmp_path),
        "--output", "compact.js",
        "--no-attach-indicators",
    ]) == 0
    first_line = (tmp_path / "compact.js").read_text(encoding="utf-8").splitlines()[0]
    bundle = json.loads(first_line.split(" = ", 1)[1].removesuffix(";"))
    assert "densitat" not in bundle["geo"]["features"][0]["properties"]


def test_invalid_source_attachment_option_is_rejected(tmp_path, monkeypatch):
    monkeypatch.setattr(build_data, "load_source", lambda name, **kwargs: InvalidAttachSource())
    with pytest.raises(TypeError, match="attach_indicators debe ser booleano"):
        build_data.construir("invalid", tmp_path)


def test_bundle_build_is_byte_reproducible(tmp_path, monkeypatch):
    monkeypatch.setattr(build_data, "load_source", lambda name, **kwargs: CompactSource())
    build_data.construir("compact", tmp_path, output=Path("first.js"), project_root=tmp_path)
    build_data.construir("compact", tmp_path, output=Path("second.js"), project_root=tmp_path)
    assert (tmp_path / "first.js").read_bytes() == (tmp_path / "second.js").read_bytes()
