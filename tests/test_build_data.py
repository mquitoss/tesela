"""Tests del pipeline base (build_data.py) y del adaptador de ejemplo.

Sin red: el Source de ejemplo se prueba con un fake que implementa el mismo
contrato, y las funciones puras del pipeline se prueban directamente.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import build_data  # noqa: E402
from sources.example_source import compute_density  # noqa: E402


# --- helpers puros del pipeline --------------------------------------------


def test_normalize_name_mirrors_frontend():
    assert build_data.normalize_name("el Raval") == "raval"
    assert build_data.normalize_name("Gràcia") == "gracia"
    assert build_data.normalize_name("la  Barceloneta") == "barceloneta"
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


def test_emit_bundle_js_writes_namespaced_global(tmp_path):
    bundle = {"geo": {"type": "FeatureCollection", "features": []}, "indicators": [], "meta": {}}
    out = tmp_path / "bundle.js"
    build_data.emit_bundle_js(bundle, out, namespace="SSM_DATA")
    text = out.read_text(encoding="utf-8")
    assert text.startswith("window.SSM_DATA = ")
    payload = json.loads(text[len("window.SSM_DATA = ") : -2])  # quita ` = ` y `;\n`
    assert "geo" in payload and "indicators" in payload


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


def test_construir_emits_valid_bundle(tmp_path, monkeypatch):
    monkeypatch.setattr(build_data, "load_source", lambda name: FakeSource())
    bundle = build_data.construir("fake", tmp_path)
    assert (tmp_path / "bundle.js").exists()
    assert bundle["meta"]["zonas"] == 1
    assert bundle["meta"]["con_dato"] == 1
    # La densidad llega a las properties de la feature (tooltip rico).
    assert bundle["geo"]["features"][0]["properties"]["densitat"] == 50000.0
