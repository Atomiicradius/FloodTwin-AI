"""One-at-a-time sensitivity of evidence status to weights and thresholds (Role A).

Deterministic grid (no random sampling). For indicator-recomputing variants (corridor buffer,
stream threshold) the caller supplies pre-computed indicator columns.
"""

from __future__ import annotations

import copy
from typing import Any

import pandas as pd

from floodtwin.evidence.scoring import TERRAIN, assign_status


def _changed(base: pd.Series, new: pd.Series) -> float:
    return float((base.to_numpy() != new.to_numpy()).mean())


def rule_variants(cfg: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    """Enumerate config variants: weight +/-, threshold +/-, official-map flag, tertiary rule."""
    s = cfg["sensitivity"]
    out: list[tuple[str, dict[str, Any]]] = []
    for ind in TERRAIN:
        for sign in (+1, -1):
            c = copy.deepcopy(cfg)
            c["weights"][ind] *= 1 + sign * s["weight_perturbation"]
            out.append((f"weight {ind} {'+' if sign > 0 else '-'}{int(100 * s['weight_perturbation'])}%", c))
    for key in ("terrain_agree_min", "terrain_disagree_max"):
        for sign in (+1, -1):
            c = copy.deepcopy(cfg)
            c["status_rule"][key] += sign * s["threshold_shift"]
            out.append((f"{key} {'+' if sign > 0 else '-'}{s['threshold_shift']}", c))
    c = copy.deepcopy(cfg)
    c["status_rule"]["count_official_map_as_source"] = False
    out.append(("official map not counted as a source", c))
    c = copy.deepcopy(cfg)
    c["status_rule"]["terrain_decisive_hierarchies"] = ["primary"]
    out.append(("terrain decisive for primary only", c))
    return out


def run_sensitivity(df: pd.DataFrame, cfg: dict[str, Any],
                    indicator_variants: dict[str, pd.DataFrame] | None = None) -> pd.DataFrame:
    """Return one row per variant with the fraction of links whose status changed.

    Args:
        df: indicator table (baseline indicators).
        cfg: baseline evidence config.
        indicator_variants: name -> df with alternative indicator columns (same row order).
    """
    base = assign_status(df, cfg)["evidence_status"]
    rows = []

    def summarise(name: str, new: pd.Series) -> None:
        r = {"variant": name, "frac_status_changed": _changed(base, new), "n_links": len(new)}
        for st in ("SUPPORTED", "DISPUTED", "UNVERIFIED", "VERIFIED"):
            r[f"n_{st}"] = int((new == st).sum())
        rows.append(r)

    summarise("baseline", base)
    for name, c in rule_variants(cfg):
        summarise(name, assign_status(df, c)["evidence_status"])
    for name, vdf in (indicator_variants or {}).items():
        summarise(name, assign_status(vdf, cfg)["evidence_status"])
    return pd.DataFrame(rows)
