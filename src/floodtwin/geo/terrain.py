"""DEM preparation and terrain-flow analysis (Role A).

All rasters are written on one grid: EPSG:32643, 30 m, AOI = BBMP bbox + buffer.
Products (GeoTIFF, nodata explicit):
    dem_<name>_utm.tif       reprojected raw DEM (m, vertical datum of the source)
    dem_conditioned.tif      pits filled, depressions filled, flats resolved (pysheds)
    sink_depth.tif           filled - raw (m): depression map (tanks/lakes and DSM artefacts)
    flowdir_d8.tif           D8 directions, pysheds/ESRI coding (64,128,1,2,4,8,16,32)
    acc_d8_km2.tif           D8 upstream area (km2, includes the cell itself)
    acc_dinf_km2.tif         D-infinity upstream area (km2)

Interpretation limits (P3): a 30 m DEM resolves terrain-scale flow corridors only. It does
not resolve roadside drains, culverts or covered drains; the Copernicus DEM is a surface
model that includes buildings and canopy.
"""

from __future__ import annotations

import gzip
import logging
import shutil
from pathlib import Path

import numpy as np
import rasterio
from rasterio.merge import merge
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject

log = logging.getLogger(__name__)

NODATA = -9999.0
# pysheds default dirmap: N, NE, E, SE, S, SW, W, NW
DIRMAP = (64, 128, 1, 2, 4, 8, 16, 32)
# (drow, dcol) for each code
D8_OFFSETS = {64: (-1, 0), 128: (-1, 1), 1: (0, 1), 2: (1, 1), 4: (1, 0), 8: (1, -1), 16: (0, -1), 32: (-1, -1)}


def open_tile(path: Path, workdir: Path) -> Path:
    """Return a GDAL-readable path; `.hgt.gz` tiles are decompressed into `workdir`."""
    if path.name.endswith(".gz"):
        out = workdir / path.name[:-3]
        if not out.exists():
            workdir.mkdir(parents=True, exist_ok=True)
            with gzip.open(path, "rb") as src, open(out, "wb") as dst:
                shutil.copyfileobj(src, dst)
        return out
    return path


def aoi_grid(bounds_m: tuple[float, float, float, float], res_m: float):
    """Snap AOI bounds (metric) outward to a `res_m` grid. Returns (transform, width, height)."""
    xmin, ymin, xmax, ymax = bounds_m
    xmin = np.floor(xmin / res_m) * res_m
    ymax = np.ceil(ymax / res_m) * res_m
    width = int(np.ceil((xmax - xmin) / res_m))
    height = int(np.ceil((ymax - ymin) / res_m))
    return from_origin(xmin, ymax, res_m, res_m), width, height


def build_dem(tile_paths: list[Path], workdir: Path, dst_crs: str, transform, width: int,
              height: int, out_path: Path, resampling: str = "bilinear") -> dict:
    """Mosaic tiles and reproject onto the project grid.

    Returns:
        Stats dict: source CRS/resolution, void cell count (nodata or < -100 m) in the AOI.
    """
    srcs = [rasterio.open(open_tile(p, workdir)) for p in tile_paths]
    try:
        mosaic, mtrans = merge(srcs, nodata=NODATA)
        src_crs = srcs[0].crs
        src_res = srcs[0].res
        src_nodata = srcs[0].nodata
    finally:
        for s in srcs:
            s.close()
    arr = mosaic[0].astype("float32")
    if src_nodata is not None:
        arr[arr == src_nodata] = NODATA
    arr[arr < -100] = NODATA  # SRTM void value is -32768
    dst = np.full((height, width), NODATA, dtype="float32")
    reproject(arr, dst, src_transform=mtrans, src_crs=src_crs, dst_transform=transform,
              dst_crs=dst_crs, resampling=Resampling[resampling], src_nodata=NODATA, dst_nodata=NODATA)
    write_raster(out_path, dst, transform, dst_crs)
    return {
        "source_crs": str(src_crs),
        "source_res_deg": [float(r) for r in src_res],
        "void_cells": int((dst == NODATA).sum()),
        "cells": int(dst.size),
        "elev_min_m": float(dst[dst != NODATA].min()),
        "elev_max_m": float(dst[dst != NODATA].max()),
    }


def write_raster(path: Path, arr: np.ndarray, transform, crs: str, nodata: float = NODATA) -> None:
    """Write a single-band GeoTIFF (deflate)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    dtype = arr.dtype if arr.dtype != np.float64 else np.float32
    with rasterio.open(path, "w", driver="GTiff", height=arr.shape[0], width=arr.shape[1], count=1,
                       dtype=dtype, crs=crs, transform=transform, nodata=nodata,
                       compress="deflate") as dst:
        dst.write(arr.astype(dtype), 1)


def read_raster(path: Path) -> tuple[np.ndarray, "rasterio.Affine", str]:
    """Read band 1 as float array; returns (array, transform, crs string)."""
    with rasterio.open(path) as src:
        return src.read(1), src.transform, str(src.crs)


def condition_and_route(dem_path: Path, out_dir: Path) -> dict:
    """Condition the DEM and compute D8 / D-inf routing with pysheds.

    Returns:
        Dict of output paths and summary statistics (sink cells, max sink depth).
    """
    from pysheds.grid import Grid  # heavy import, keep local

    grid = Grid.from_raster(str(dem_path), nodata=NODATA)
    dem = grid.read_raster(str(dem_path), nodata=NODATA)
    pit = grid.fill_pits(dem)
    filled = grid.fill_depressions(pit)
    flat = grid.resolve_flats(filled)
    fdir = grid.flowdir(flat, dirmap=DIRMAP)
    acc = grid.accumulation(fdir, dirmap=DIRMAP)
    fdir_inf = grid.flowdir(flat, routing="dinf")
    acc_inf = grid.accumulation(fdir_inf, routing="dinf")
    raw = np.asarray(dem, dtype="float64")
    valid = raw != NODATA
    sink = np.where(valid, np.asarray(filled) - raw, NODATA)
    cell_km2 = abs(grid.affine.a * grid.affine.e) / 1e6
    with rasterio.open(dem_path) as src:
        transform, crs = src.transform, str(src.crs)
    paths = {
        "dem_conditioned": out_dir / "dem_conditioned.tif",
        "sink_depth": out_dir / "sink_depth.tif",
        "flowdir_d8": out_dir / "flowdir_d8.tif",
        "acc_d8_km2": out_dir / "acc_d8_km2.tif",
        "acc_dinf_km2": out_dir / "acc_dinf_km2.tif",
    }
    write_raster(paths["dem_conditioned"], np.where(valid, np.asarray(flat), NODATA), transform, crs)
    write_raster(paths["sink_depth"], sink, transform, crs)
    write_raster(paths["flowdir_d8"], np.asarray(fdir).astype("int32"), transform, crs, nodata=0)
    write_raster(paths["acc_d8_km2"], np.where(valid, np.asarray(acc) * cell_km2, NODATA), transform, crs)
    write_raster(paths["acc_dinf_km2"], np.where(valid, np.asarray(acc_inf) * cell_km2, NODATA), transform, crs)
    return {
        "paths": {k: str(v) for k, v in paths.items()},
        "cell_km2": cell_km2,
        "sink_cells_gt_0": int(((sink > 0) & valid).sum()),
        "sink_depth_max_m": float(sink[valid].max()),
    }


def upstream_max(acc: np.ndarray, fdir: np.ndarray) -> np.ndarray:
    """For each cell, the max accumulation among neighbours that drain INTO it (0 if none)."""
    h, w = acc.shape
    out = np.zeros_like(acc, dtype="float64")
    a = np.where(np.isfinite(acc), acc, 0.0)
    for code, (dr, dc) in D8_OFFSETS.items():
        # a neighbour at (r - dr, c - dc) with direction `code` drains into (r, c)
        src = np.zeros_like(a)
        mask = np.zeros_like(a, dtype=bool)
        rs = slice(max(dr, 0), h + min(dr, 0))
        cs = slice(max(dc, 0), w + min(dc, 0))
        rsrc = slice(max(-dr, 0), h + min(-dr, 0))
        csrc = slice(max(-dc, 0), w + min(-dc, 0))
        src[rs, cs] = a[rsrc, csrc]
        mask[rs, cs] = fdir[rsrc, csrc] == code
        out = np.where(mask, np.maximum(out, src), out)
    return out


def trace_downstream(fdir: np.ndarray, r: int, c: int, max_steps: int) -> list[tuple[int, int]]:
    """Follow D8 directions from (r, c) for up to `max_steps` cells (stops at edges/sinks)."""
    h, w = fdir.shape
    path = [(r, c)]
    for _ in range(max_steps):
        code = int(fdir[r, c])
        if code not in D8_OFFSETS:
            break
        dr, dc = D8_OFFSETS[code]
        r, c = r + dr, c + dc
        if not (0 <= r < h and 0 <= c < w):
            break
        path.append((r, c))
    return path
