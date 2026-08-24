from pathlib import Path


class Source:
    attach_indicators = False

    def __init__(self, project_root: Path) -> None:
        self.project_root = project_root

    def geometry(self) -> dict:
        return {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {"ID": "001", "NAME": "Zona de ejemplo"},
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[[1.8, 41.3], [2.2, 41.3], [2.2, 41.7], [1.8, 41.7], [1.8, 41.3]]],
                    },
                }
            ],
        }

    def indicators(self) -> list[dict]:
        return [{"id": "001", "value": 42}]

    def metadata(self) -> dict:
        return {"license": "CC0", "project_root": str(self.project_root)}
