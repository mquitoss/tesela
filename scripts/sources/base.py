"""Contrato del adaptador de fuente de datos (Source).

Cada fuente vive en ``scripts/sources/<nombre>.py`` y expone una clase ``Source``
que implementa este protocolo. El pipeline de Tesela es agnóstico: solo
pide geometría e indicadores y los emite como bundle. Toda la lógica específica de
un dominio (de dónde vienen los datos, cómo se limpian, qué métricas se derivan)
vive en el Source, no en el pipeline.

Un agente que personaliza el framework desde un prompt clona ``example_source.py``
y reimplementa ``geometry()`` e ``indicators()`` para su dominio.

Cuando Tesela se consume como submódulo, el Source puede declarar un constructor
``__init__(project_root: Path)``; el pipeline le entrega la raíz absoluta del
proyecto host.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class Source(Protocol):
    """Fuente de datos para un mapa.

    Invariantes que toda implementación debe respetar:

    - ``indicators()`` devuelve un registro por zona con una CLAVE CANÓNICA estable
      (p. ej. ``codi``) que casa con la propiedad de join de la geometría. Los
      HUECOS de dominio se representan como ``None``, NUNCA se fabrican valores.
    - ``geometry()`` devuelve un ``FeatureCollection`` GeoJSON cuyas features llevan
      esa misma clave en ``properties`` (p. ej. ``BARRI``).
    - ``attach_indicators`` es opcional. Si es ``False``, el bundle mantiene los
      indicadores separados de la geometría. Si falta, se conserva el modo 0.2.
    """

    attach_indicators: bool

    def geometry(self) -> dict:
        """FeatureCollection GeoJSON (ya con las propiedades relevantes)."""
        ...

    def indicators(self) -> list[dict]:
        """Lista de registros de indicador ``{clave, nom, <metricas>}``."""
        ...

    # Una implementación puede añadir `metadata() -> dict`; es opcional y el
    # pipeline lo incorpora a `bundle.meta` cuando está presente.
