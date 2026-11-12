"""Minimal, dependency-free KML reader (streams large files).

Reads every Placemark: its `<name>`, all `<SimpleData>`/`<Data>` attributes, and its geometry
(Point, LineString, Polygon, or MultiGeometry of these). Input CRS is EPSG:4326 (KML spec);
the z coordinate is dropped. Geometries are returned exactly as written — validity checks
belong to `floodtwin.geo.audit`, not here, so nothing is silently repaired or dropped.
"""

from __future__ import annotations

import math
import xml.etree.ElementTree as ET
from pathlib import Path

import geopandas as gpd
from shapely.geometry import (
    LineString,
    MultiLineString,
    MultiPoint,
    MultiPolygon,
    Point,
    Polygon,
)
from shapely.geometry.base import BaseGeometry

KML_CRS = "EPSG:4326"


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _coords(text: str | None) -> list[tuple[float, float]]:
    out: list[tuple[float, float]] = []
    for tok in (text or "").split():
        parts = tok.split(",")
        if len(parts) >= 2:
            x, y = float(parts[0]), float(parts[1])
            if math.isfinite(x) and math.isfinite(y):  # sources contain literal "nan,nan"
                out.append((x, y))
    return out


def _find_coords(el: ET.Element) -> list[tuple[float, float]]:
    for sub in el.iter():
        if _local(sub.tag) == "coordinates":
            return _coords(sub.text)
    return []


def _parse_geom(el: ET.Element) -> BaseGeometry | None:
    """Parse one geometry element. Degenerate inputs are kept (as empty/short geoms)."""
    kind = _local(el.tag)
    if kind == "Point":
        c = _find_coords(el)
        return Point(c[0]) if c else Point()
    if kind == "LineString":
        c = _find_coords(el)
        # A 1-vertex line is invalid in shapely; keep it as an explicitly empty line so the
        # audit can count it as a degenerate geometry.
        return LineString(c) if len(c) >= 2 else LineString()
    if kind == "Polygon":
        outer: list[tuple[float, float]] = []
        inners: list[list[tuple[float, float]]] = []
        for sub in el:
            name = _local(sub.tag)
            if name == "outerBoundaryIs":
                outer = _find_coords(sub)
            elif name == "innerBoundaryIs":
                inners.append(_find_coords(sub))
        return Polygon(outer, inners) if len(outer) >= 4 else Polygon()
    if kind == "MultiGeometry":
        parts = [g for g in (_parse_geom(s) for s in el) if g is not None]
        types = {g.geom_type for g in parts}
        if types <= {"LineString"}:
            return MultiLineString([g for g in parts if not g.is_empty])
        if types <= {"Point"}:
            return MultiPoint([g for g in parts if not g.is_empty])
        if types <= {"Polygon"}:
            return MultiPolygon([g for g in parts if not g.is_empty])
        # Mixed collections are not expected in these sources; surface loudly.
        raise ValueError(f"mixed MultiGeometry types {types} are not supported")
    return None


GEOM_TAGS = {"Point", "LineString", "Polygon", "MultiGeometry"}


def read_kml(path: Path) -> gpd.GeoDataFrame:
    """Read all Placemarks of a KML file.

    Args:
        path: KML file path.

    Returns:
        GeoDataFrame in EPSG:4326 with columns `kml_index` (0-based order in file),
        `kml_name`, one column per attribute (strings, untyped), and `geometry`.
    """
    rows: list[dict] = []
    geoms: list[BaseGeometry | None] = []
    for _event, el in ET.iterparse(str(path), events=("end",)):
        if _local(el.tag) != "Placemark":
            continue
        row: dict = {"kml_index": len(rows), "kml_name": None}
        geom = None
        for child in el:
            name = _local(child.tag)
            if name == "name":
                row["kml_name"] = (child.text or "").strip() or None
            elif name in GEOM_TAGS and geom is None:
                geom = _parse_geom(child)
        for sub in el.iter():
            sname = _local(sub.tag)
            if sname == "SimpleData":
                row[sub.attrib.get("name", "")] = (sub.text or "").strip() or None
            elif sname == "Data":
                val = next((v for v in sub if _local(v.tag) == "value"), None)
                row[sub.attrib.get("name", "")] = (
                    (val.text or "").strip() if val is not None else None
                )
        rows.append(row)
        geoms.append(geom)
        el.clear()
    return gpd.GeoDataFrame(rows, geometry=geoms, crs=KML_CRS)
