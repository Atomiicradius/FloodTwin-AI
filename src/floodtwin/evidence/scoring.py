"""Deterministic evidence index and status rule (Role A, technical-specs §5.3).

`evidence_score` is a transparent weighted INDEX in [0, 1]; it is not a probability.
`evidence_status` comes from a rule on independent evidence SOURCES (not on the index):

    VERIFIED    a reliable direct observation supports the segment and nothing contradicts it
    SUPPORTED   >= 2 independent sources agree (official map counts as one if configured;
                all DEM indicators together count as ONE source)
    DISPUTED    independent sources disagree materially (terrain index <= disagree threshold)
    UNVERIFIED  insufficient independent evidence (incl. drains below DEM resolution)
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

STATUSES = ("VERIFIED", "SUPPORTED", "DISPUTED", "UNVERIFIED")
TERRAIN = ("terrain_alignment", "terminal_plausibility", "connectivity_consistency")
ALL_INDICATORS = (*TERRAIN, "historical_evidence", "imagery_evidence", "observation_evidence")


def weighted_index(df: pd.DataFrame, weights: dict[str, float], cols: tuple[str, ...]) -> np.ndarray:
    """Weighted mean over available (non-NaN) indicators; weights renormalised per row.

    Rows with no available weighted indicator get NaN.
    """
    vals = np.column_stack([df[c].to_numpy(dtype=float) if c in df else np.full(len(df), np.nan) for c in cols])
    w = np.array([weights.get(c, 0.0) for c in cols], dtype=float)
    avail = np.isfinite(vals) & (w > 0)
    wsum = (avail * w).sum(axis=1)
    num = np.where(avail, vals, 0.0) @ w
    with np.errstate(invalid="ignore", divide="ignore"):
        return np.where(wsum > 0, num / wsum, np.nan)


def assign_status(df: pd.DataFrame, cfg: dict[str, Any]) -> pd.DataFrame:
    """Compute `terrain_index`, `evidence_score`, `evidence_status`, `evidence_notes`.

    Args:
        df: one row per link with indicator columns and `hierarchy`.
        cfg: the parsed `configs/evidence.yaml`.

    Returns:
        Copy of `df` with the four added columns. Deterministic for identical input.
    """
    rule = cfg["status_rule"]
    weights = cfg["weights"]
    out = df.copy()
    for c in ALL_INDICATORS:
        if c not in out:
            out[c] = np.nan
    out["terrain_index"] = weighted_index(out, weights, TERRAIN)
    out["evidence_score"] = weighted_index(out, weights, ALL_INDICATORS)

    decisive = out["hierarchy"].isin(rule["terrain_decisive_hierarchies"]).to_numpy()
    ti = out["terrain_index"].to_numpy()
    terrain_agrees = decisive & (ti >= rule["terrain_agree_min"])
    terrain_disagrees = decisive & (ti <= rule["terrain_disagree_max"])
    obs = out["observation_evidence"].to_numpy(dtype=float)
    img = out["imagery_evidence"].to_numpy(dtype=float)
    obs_pos = np.isfinite(obs) & (obs >= 0.5)
    obs_neg = np.isfinite(obs) & (obs < 0.5)
    img_pos = np.isfinite(img) & (img >= 0.5)
    img_neg = np.isfinite(img) & (img < 0.5)

    n_agree = (
        (1 if rule["count_official_map_as_source"] else 0)
        + terrain_agrees.astype(int)
        + img_pos.astype(int)
        + obs_pos.astype(int)
    )
    n_disagree = terrain_disagrees.astype(int) + img_neg.astype(int) + obs_neg.astype(int)

    status = np.full(len(out), "UNVERIFIED", dtype=object)
    status[(n_agree >= 2) & (n_disagree == 0)] = "SUPPORTED"
    status[n_disagree > 0] = "DISPUTED"
    status[obs_pos & (n_disagree == 0)] = "VERIFIED"
    out["evidence_status"] = status

    notes = []
    for i in range(len(out)):
        parts = []
        if not decisive[i]:
            parts.append(f"{out['hierarchy'].iat[i]} drain below 30 m DEM resolution: terrain not decisive")
        elif np.isnan(ti[i]):
            parts.append("terrain not assessable")
        elif terrain_agrees[i]:
            parts.append(f"terrain-scale consistent (terrain_index={ti[i]:.2f})")
        elif terrain_disagrees[i]:
            parts.append(f"terrain-scale inconsistency, worth investigating (terrain_index={ti[i]:.2f}); not proof of absence or blockage")
        else:
            parts.append(f"terrain inconclusive (terrain_index={ti[i]:.2f})")
        if np.isnan(img[i]):
            parts.append("imagery not assessed")
        if np.isnan(obs[i]):
            parts.append("no field/citizen observation")
        hc = out["historical_count"].iat[i] if "historical_count" in out else 0
        if hc:
            parts.append(f"{int(hc)} recorded flood location(s) nearby (behavioural hint)")
        notes.append("; ".join(parts))
    out["evidence_notes"] = notes
    return out
