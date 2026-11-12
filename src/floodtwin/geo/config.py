"""Configuration and path helpers for Role A modules.

NOTE: `floodtwin.common` (Role D) does not exist yet. These helpers are deliberately small and
should be replaced by `common.paths` / `common.crs` once Role D ships them.
"""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any

import yaml

REPO_ROOT = Path(__file__).resolve().parents[3]


def load_yaml(path: Path) -> dict[str, Any]:
    """Load a YAML file into a dict."""
    with open(path, encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def geo_config() -> dict[str, Any]:
    """Return `configs/geo.yaml` (paths, CRS, tolerances, catchment search parameters)."""
    return load_yaml(REPO_ROOT / "configs" / "geo.yaml")


def evidence_config() -> dict[str, Any]:
    """Return `configs/evidence.yaml` (indicator thresholds, weights, status rule)."""
    return load_yaml(REPO_ROOT / "configs" / "evidence.yaml")


def manifest() -> dict[str, Any]:
    """Return `data/MANIFEST.yaml`."""
    return load_yaml(REPO_ROOT / "data" / "MANIFEST.yaml")


def raw_path(source_id: str) -> Path:
    """Local path of a raw source listed in the manifest."""
    for src in manifest()["sources"]:
        if src["id"] == source_id:
            return REPO_ROOT / "data" / "raw" / source_id / src["filename"]
    raise KeyError(f"source_id {source_id!r} is not in data/MANIFEST.yaml")


def sha256_file(path: Path, chunk: int = 1 << 20) -> str:
    """SHA-256 hex digest of a file."""
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        while block := fh.read(chunk):
            h.update(block)
    return h.hexdigest()
