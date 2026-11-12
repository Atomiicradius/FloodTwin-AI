"""Audit figures (matplotlib, Agg). Captions live in reports/01_data_audit.md."""

from __future__ import annotations

import matplotlib

matplotlib.use("Agg")
import geopandas as gpd  # noqa: E402
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

STATUS_COLORS = {"SUPPORTED": "#1b7837", "DISPUTED": "#c51b7d", "UNVERIFIED": "#8c8c8c", "VERIFIED": "#2166ac"}
HIER_COLORS = {"primary": "#08306b", "secondary": "#4292c6", "tertiary": "#bdbdbd"}


def _save(fig, path):
    fig.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)


def make_all(ctx, segs, t, ta, ob, netw, cand, exp) -> None:
    f = ctx.fig
    zones = gpd.GeoSeries([t["bbmp"]], crs=ctx.crs)

    # 1. inventory map
    fig, ax = plt.subplots(figsize=(9, 9))
    zones.boundary.plot(ax=ax, color="k", lw=0.8)
    for h in ("tertiary", "secondary", "primary"):
        segs[h].plot(ax=ax, color=HIER_COLORS[h], lw={"primary": 1.6, "secondary": 0.9, "tertiary": 0.3}[h], label=f"{h} SWD")
    ob["stations"].plot(ax=ax, marker="^", color="#e6550d", markersize=14, label="KSNDMC rain gauge (location)")
    ob["loc"].plot(ax=ax, marker="o", color="#d62728", markersize=5, alpha=0.6, label="official flood-location record")
    fo = ob["fo"][~ob["fo"].geometry.is_empty]
    fo.plot(ax=ax, marker="*", color="#ffd700", edgecolor="k", markersize=60, label="news report (geocoded, low conf.)")
    ax.legend(loc="lower left", fontsize=7)
    ax.set_title("Bengaluru drainage inventory and observation sources (EPSG:32643)")
    ax.set_axis_off()
    _save(fig, f / "01_inventory_map.png")

    # 2. connectivity sensitivity
    s = pd.DataFrame(ctx.numbers["audit"]["connectivity_sensitivity_primary_secondary"])
    fig, ax1 = plt.subplots(figsize=(6, 3.5))
    ax1.plot(s["snap_tol_m"], s["n_components"], "o-", label="connected components")
    ax1.plot(s["snap_tol_m"], s["n_dangling_nodes"], "s-", label="dangling nodes")
    ax1.set_xscale("log"); ax1.set_xlabel("snap tolerance (m)"); ax1.set_ylabel("count")
    ax2 = ax1.twinx()
    ax2.plot(s["snap_tol_m"], s["largest_component_length_frac"], "d--", color="g", label="largest-component length share")
    ax2.set_ylim(0, 1); ax2.set_ylabel("share", color="g")
    ax1.legend(fontsize=7, loc="center left")
    ax1.set_title("Primary+secondary network vs snap tolerance")
    _save(fig, f / "01_connectivity_sensitivity.png")

    # 3. DEM difference
    d = ta["cop_minus_srtm"]
    fig, ax = plt.subplots(figsize=(8, 8))
    ext = (ta["transform"].c, ta["transform"].c + d.shape[1] * ta["transform"].a,
           ta["transform"].f + d.shape[0] * ta["transform"].e, ta["transform"].f)
    im = ax.imshow(d, cmap="RdBu_r", vmin=-15, vmax=15, extent=ext)
    zones.boundary.plot(ax=ax, color="k", lw=0.8)
    plt.colorbar(im, ax=ax, shrink=0.7, label="Copernicus GLO-30 minus SRTM (m)")
    ax.set_title("DEM candidate disagreement (positive = Copernicus higher)")
    ax.set_axis_off()
    _save(fig, f / "01_dem_difference.png")

    # 4. candidate ranking map
    fig, ax = plt.subplots(figsize=(9, 9))
    zones.boundary.plot(ax=ax, color="k", lw=0.8)
    cand.sort_values("area_km2", ascending=False).plot(ax=ax, column="weighted_total", cmap="viridis", edgecolor="w", lw=0.3, legend=True,
              legend_kwds={"label": "weighted score (max 54)", "shrink": 0.6})
    for r in cand.head(5).itertuples():
        p = r.geometry.representative_point()
        ax.annotate(f"#{r.rank}", (p.x, p.y), color="w", fontsize=9, ha="center", weight="bold")
    ax.set_title("Terrain-defined candidate catchments (all scales; larger drawn first)")
    ax.set_axis_off()
    _save(fig, f / "01_catchment_candidates.png")

    # 5. city evidence map
    fig, ax = plt.subplots(figsize=(9, 9))
    zones.boundary.plot(ax=ax, color="k", lw=0.8)
    L = netw["links"]
    for st, c in STATUS_COLORS.items():
        sub = L[L["evidence_status"] == st]
        if len(sub):
            sub.plot(ax=ax, color=c, lw=1.0, label=f"{st} (n={len(sub)})")
    ax.legend(loc="lower left", fontsize=8)
    ax.set_title("Evidence status v0, primary+secondary (index, not probability)")
    ax.set_axis_off()
    _save(fig, f / "01_evidence_status_city.png")

    # 6. selected catchment detail
    fig, ax = plt.subplots(figsize=(8, 8))
    acc = ta["acc_d8_km2"]
    xmin, ymin, xmax, ymax = exp["poly"].buffer(500).bounds
    ax.imshow(np.log10(np.where(acc > 0, acc, np.nan)), cmap="Blues", extent=ext, vmin=-3, vmax=1.5, alpha=0.7)
    gpd.GeoSeries([exp["poly"]], crs=ctx.crs).boundary.plot(ax=ax, color="k", lw=1.2)
    for st, c in STATUS_COLORS.items():
        sub = exp["links"][exp["links"]["evidence_status"] == st]
        if len(sub):
            sub.plot(ax=ax, color=c, lw=2, label=f"{st} (n={len(sub)})")
    n = exp["nodes"]
    n[n["node_type"] == "outfall"].plot(ax=ax, color="orange", markersize=25, marker="v", label="outfall (inferred)")
    if len(exp["loc"]):
        exp["loc"].plot(ax=ax, color="#d62728", markersize=12, label="official flood location")
    if len(exp["fo"]):
        exp["fo"].plot(ax=ax, marker="*", color="#ffd700", edgecolor="k", markersize=90, label="news report")
    ax.set_xlim(xmin, xmax); ax.set_ylim(ymin, ymax)
    ax.legend(fontsize=7, loc="lower left")
    ax.set_title(f"{exp['catchment_id']}: network_v1 evidence status over log10 D8 area (km2)")
    ax.set_axis_off()
    _save(fig, f / "01_selected_catchment.png")

    # 7. sensitivity bars
    sens = pd.DataFrame(ctx.numbers["network_city"]["sensitivity"])
    sens = sens[sens["variant"] != "baseline"]
    fig, ax = plt.subplots(figsize=(7, 4.5))
    ax.barh(sens["variant"], 100 * sens["frac_status_changed"], color="#636363")
    ax.set_xlabel("% of links whose status changes vs baseline")
    ax.set_title("Evidence-status sensitivity (one-at-a-time)")
    ax.invert_yaxis()
    _save(fig, f / "01_evidence_sensitivity.png")
