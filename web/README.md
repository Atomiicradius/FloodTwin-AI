# FloodTwin-AI dashboard prototype (Role D, `web/`)

A front-end prototype of the "killer demonstration" flow from `context/team-plan.md` §9.2.
**Everything shown is synthetic** (experiment class B): an invented catchment, storms and flood reports.
It illustrates the workflow and the interface, not a real result, and it must not be presented as validation.

## Run

```bash
cd web
npm install
npm run dev      # http://localhost:5173
npm run build    # static build in web/dist (works offline, no backend)
```

## The seven steps

1. Event & location · 2. Infrastructure evidence · 3. Baseline simulation · 4. Counterfactual ·
5. Interactions · 6. Uncertainty · 7. AI scalability

Keys: `←` `→` steps, `1`–`7` jump, `P` presenter mode (narration captions).

## How the demo numbers are produced

| Piece | What it is | Replaced by (real project) |
|---|---|---|
| `src/data/terrain.js` | Synthetic DEM, D8 flow accumulation after priority-flood | Real DEM + `geo` module |
| `src/data/network.js` | Invented drain network and evidence table; deterministic evidence-status rule | `evidence` module output |
| `src/model/sim.js` | Simplified 1D routing ("SWMM-lite"), **not EPA SWMM** | `swmm` module |
| `src/model/spread.js` | Volume-conserving local surface-spreading step (explicit, per P5) | `surface` module |
| `src/model/analysis.js` | Counterfactuals, 2³ interactions + Shapley, 300-scenario ensemble | `cf`, `uncertainty` modules |
| GNN page | **Illustrative placeholder timings**, nothing trained or measured | Phase 5 benchmark |

All randomness is seeded. Parameters carry provenance tags (all `assumed` or `sourced (synthetic)`).

## Principles the UI keeps visible

Evidence status, never a probability (P4) · DEM evidence is terrain-scale only (P3) ·
node flooding is not a flood map (P5) · SYN-3 is held out (P6) · scenario envelope, not bounds (P13) ·
GNN screens, SWMM decides (P9) · every view has a Limitations & assumptions drawer.
