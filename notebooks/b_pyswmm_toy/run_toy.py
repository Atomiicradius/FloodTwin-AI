"""Run the Role B Phase 1 toy SWMM model through pyswmm.

This is a toolchain check, not the team toy pipeline, and it is not part of
`tests/fixtures/`. It loads `toy_network.inp`, steps the engine, records
runoff and flow-routing continuity errors, and writes `run_results.json`
beside the input file.

Experiment class: A_unit.
"""

from __future__ import annotations

import hashlib
import json
import platform
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import pyswmm
from pyswmm import Links, Nodes, Simulation

CONTINUITY_THRESHOLD_PCT = 5.0


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()


def parse_report_continuity(rpt_path: Path) -> dict[str, float | None]:
    """Pull the two 'Continuity Error (%)' values out of a SWMM .rpt file."""
    if not rpt_path.exists():
        return {"runoff": None, "flow_routing": None}
    text = rpt_path.read_text(encoding="utf-8", errors="replace")
    values = re.findall(r"Continuity Error \(%\)[.\s]*(-?\d+(?:\.\d+)?)", text)
    return {
        "runoff": float(values[0]) if len(values) > 0 else None,
        "flow_routing": float(values[1]) if len(values) > 1 else None,
    }


def main(inp_path: Path) -> int:
    inp_path = inp_path.resolve()
    rpt_path = inp_path.with_suffix(".rpt")
    out_path = inp_path.with_name("run_results.json")

    node_peak_depth: dict[str, float] = {}
    node_flood_volume: dict[str, float] = {}
    node_flood_minutes: dict[str, float] = {}
    link_peak_flow: dict[str, float] = {}

    started = datetime.now(timezone.utc)
    sim_seconds = 0.0

    with Simulation(str(inp_path)) as sim:
        nodes = Nodes(sim)
        links = Links(sim)
        node_ids = [node.nodeid for node in nodes]
        link_ids = [link.linkid for link in links]
        for node_id in node_ids:
            node_peak_depth[node_id] = 0.0
            node_flood_volume[node_id] = 0.0
            node_flood_minutes[node_id] = 0.0
        for link_id in link_ids:
            link_peak_flow[link_id] = 0.0

        prev = sim.start_time
        for _ in sim:
            now = sim.current_time
            dt_s = (now - prev).total_seconds()
            prev = now
            sim_seconds += dt_s

            for node in Nodes(sim):
                depth = node.depth
                if depth > node_peak_depth[node.nodeid]:
                    node_peak_depth[node.nodeid] = depth
                flooding = node.flooding
                if flooding > 0:
                    node_flood_volume[node.nodeid] += flooding * dt_s
                    node_flood_minutes[node.nodeid] += dt_s / 60.0

            for link in Links(sim):
                flow = link.flow
                if flow > link_peak_flow[link.linkid]:
                    link_peak_flow[link.linkid] = flow

    runoff_error = sim.runoff_error
    routing_error = sim.flow_routing_error
    engine_version = sim.engine_version

    finished = datetime.now(timezone.utc)
    rpt_errors = parse_report_continuity(rpt_path)

    # The .rpt values are the project's reference measure (Role B responsibility
    # 9). pyswmm's own properties are recorded for comparison; in pyswmm 2.2.0
    # they returned 0.0 when queried after a step loop, so they are not used for
    # the pass/fail check when the report values are available.
    checked_errors = [
        rpt_errors["runoff"] if rpt_errors["runoff"] is not None else runoff_error,
        rpt_errors["flow_routing"] if rpt_errors["flow_routing"] is not None else routing_error,
    ]

    result = {
        "exp_class": "A_unit",
        "inp_file": inp_path.name,
        "inp_sha256": sha256(inp_path),
        "run_started_utc": started.isoformat(),
        "run_finished_utc": finished.isoformat(),
        "simulated_seconds": round(sim_seconds, 1),
        "software": {
            "python": sys.version.split()[0],
            "pyswmm": str(pyswmm.__version__),
            "swmm_engine": str(engine_version),
            "platform": platform.platform(),
        },
        "continuity_error_pct": {
            "pyswmm_runoff": runoff_error,
            "pyswmm_flow_routing": routing_error,
            "rpt_runoff": rpt_errors["runoff"],
            "rpt_flow_routing": rpt_errors["flow_routing"],
        },
        "continuity_threshold_pct": CONTINUITY_THRESHOLD_PCT,
        "continuity_within_threshold": all(
            abs(v) < CONTINUITY_THRESHOLD_PCT for v in checked_errors if v is not None
        ),
        "continuity_note": (
            "Pass/fail uses the .rpt report values. pyswmm 2.2.0 Simulation."
            "runoff_error and flow_routing_error returned 0.0 in this step-loop "
            "usage; they are recorded for comparison only."
        ),
        "node_peak_depth_m": {k: round(v, 4) for k, v in node_peak_depth.items()},
        "node_flood_volume_m3": {k: round(v, 2) for k, v in node_flood_volume.items()},
        "node_flood_minutes": {k: round(v, 1) for k, v in node_flood_minutes.items()},
        "link_peak_flow_cms": {k: round(v, 4) for k, v in link_peak_flow.items()},
    }

    out_path.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))
    return 0 if result["continuity_within_threshold"] else 1


if __name__ == "__main__":
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).with_name("toy_network.inp")
    raise SystemExit(main(target))
