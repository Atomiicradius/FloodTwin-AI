"""Class A unit tests: KML reader and non-nested candidate basins."""

import numpy as np

from floodtwin.geo import catchments
from floodtwin.geo.kml import read_kml

KML = """<?xml version="1.0" encoding="utf-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Folder>
<Placemark><name>a</name><ExtendedData><SchemaData><SimpleData name="OBJECTID">1</SimpleData></SchemaData></ExtendedData>
<MultiGeometry><LineString><coordinates>77.5,12.9 77.51,12.9</coordinates></LineString>
<LineString><coordinates>77.52,12.9,0 77.53,12.91,0</coordinates></LineString></MultiGeometry></Placemark>
<Placemark><Point><coordinates>77.6,13.0</coordinates></Point></Placemark>
<Placemark><LineString><coordinates>77.6,13.0</coordinates></LineString></Placemark>
</Folder></Document></kml>"""


def test_read_kml(tmp_path):
    p = tmp_path / "t.kml"
    p.write_text(KML, encoding="utf-8")
    g = read_kml(p)
    assert len(g) == 3 and g.crs.to_epsg() == 4326
    assert list(g.geom_type) == ["MultiLineString", "Point", "LineString"]
    assert g["OBJECTID"].iat[0] == "1" and g["kml_name"].iat[0] == "a"
    assert g.geometry.iat[2].is_empty  # 1-vertex line kept as empty, not dropped


def test_head_cells_are_non_nested():
    # 1 x 6 strip all flowing east (code 1); acc grows 1..6
    acc = np.arange(1, 7, dtype=float)[None, :]
    fdir = np.full((1, 6), 1, dtype=int)
    fdir[0, 5] = 0
    heads = catchments.head_cells(acc, fdir, 3.0)
    assert heads.sum() == 1 and heads[0, 2]
    lab = catchments.basin_labels(fdir, heads)
    assert list(lab[0]) == [1, 1, 1, 0, 0, 0]
