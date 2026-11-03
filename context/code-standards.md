# Code Standards

## Repository layout

```
floodtwin/
├── README.md
├── CLAUDE.md                   # points Claude Code to context/AGENTS.md
├── context/                    # project context (read AGENTS.md first)
│   ├── AGENTS.md  project-context.md  team-plan.md
│   ├── data-and-contracts.md  code-standards.md  decisions-and-progress.md
│   └── reference/              # technical-specs.md, sources.md, prior-art-note.md
├── configs/                    # all configuration (YAML); no magic numbers in code
│   ├── project.yaml            # CRS, paths, thresholds
│   ├── params/ranges.yaml
│   ├── events.yaml
│   └── evidence.yaml
├── data/                       # gitignored contents; MANIFEST.yaml IS tracked
│   ├── raw/  interim/  processed/
│   └── MANIFEST.yaml
├── src/floodtwin/
│   ├── common/                 # D: schemas, crs, units, io, logging, seeds, manifests
│   ├── geo/  evidence/         # A
│   ├── swmm/  surface/  calib/  cf/   # B
│   ├── uncertainty/  gnn/  optim/     # C
│   └── api/                    # D
├── web/                        # D: React/Next.js dashboard
├── experiments/                # C: configs + scripts per experiment
├── notebooks/                  # exploration only; prefix with owner: a_, b_, c_, d_
├── tests/                      # mirrors src/ structure
├── results/                    # gitignored; manifests tracked
├── reports/                    # markdown reports with figures
├── Makefile
└── pyproject.toml
```

## Language, tooling, style

- **Python 3.11**, dependencies pinned (`pyproject.toml` + lock file). Use `conda`/`mamba` for geospatial stack (GDAL) if pip installs are painful; commit `environment.yml`.
- Formatting and linting: `black` (line length 100), `ruff`, `isort` rules via ruff; `mypy` on `common/` and public function signatures.
- **Type hints on all public functions**; docstrings (Google style) stating inputs, outputs, **units and CRS**.
- Pure functions where possible; side effects (file IO) only in clearly named `io`/`run` modules.
- No wildcard imports; no global mutable state; no hardcoded paths. Paths come from `configs/project.yaml` through `common.paths`.
- Logging via `logging` (never `print` in library code). Log level and format set in one place.
- Errors: raise specific exceptions with actionable messages; never swallow exceptions silently in pipelines.
- Notebooks are for exploration only. Anything that produces a deliverable or a number in a report must live in `src/` or `experiments/` as a script.

## Testing

- `pytest`; target ≥ 80% coverage on `common/`, `evidence/`, `cf/`, `surface/`; critical algorithms must have tests:
  - **Class A unit tests** (examples): reducing one conduit's capacity by a known factor changes the counterfactual output in the expected direction; surface spreading conserves volume to within tolerance (e.g., 1%); evidence status mapping is deterministic; schema validators reject malformed layers; scenario generator is reproducible given a seed.
- Every bug fix adds a regression test.
- CI must pass before merge. A small **toy network** fixture (≤ 10 nodes) lives in `tests/fixtures/` and runs the whole pipeline in < 2 minutes.

## Git workflow

- `main` is protected: PR + 1 approval + green CI. Short-lived branches: `a/evidence-score`, `b/swmm-builder`, `c/gnn-baseline`, `d/api-v0` (prefix = role letter).
- Conventional commits: `feat(evidence): add terrain alignment indicator`, `fix(surface): correct volume balance`, `docs:`, `test:`, `refactor:`, `chore:`.
- PRs ≤ ~400 changed lines where possible; description states **what, why, how tested, assumptions introduced, and experiment class affected**.
- **Cross-role review rule:** any change to `context/data-and-contracts.md`, `configs/params/ranges.yaml`, `configs/events.yaml` or `configs/evidence.yaml` needs approval from the owner and from one consumer.
- Tags: `data-v<N>`, `model-v<N>` (frozen model for held-out run), `report-v<N>`. The frozen calibrated model tag must exist **before** held-out evaluation.

## PR checklist (copy into the PR template)

- [ ] Tests added/updated; CI green
- [ ] Units and CRS documented in docstrings
- [ ] No hardcoded paths or magic numbers (moved to config)
- [ ] Any new parameter has range + provenance + source note
- [ ] Experiment class (A/B/C) stated for new results
- [ ] No claim stronger than the evidence (check wording against the principles in AGENTS.md)
- [ ] Contract/schema changes reflected in `context/data-and-contracts.md`
- [ ] Limitations or assumptions added to the relevant report

## Language and reporting rules

| Do say | Do not say |
|---|---|
| "evidence status", "evidence index" | "probability the drain works" (uncalibrated) |
| "terrain-scale inconsistency" | "the DEM proves the drain is missing" |
| "scenario envelope" | "guaranteed lower/upper bound" |
| "simulated flooding reduced in X% of sampled scenarios" (only if computed) | "this fix will prevent flooding" |
| "validated on held-out event E" | "validated" (without saying on what) |
| "physics-based flood simulation framework" | "digital twin" |
| "parameter X is weakly constrained" | "calibrated value of X is Y" (as if unique) |

Every figure caption states: experiment class, event/catchment, number of scenarios, and any key assumption. Every report section is labelled with one of: **Observed fact**, **Model assumption**, **Inferred evidence**, **Simulation result**, **Uncertainty**, **Limitation**.

## Starter Makefile targets (Role D)

```
make env        # create environment
make data       # fetch/verify data per MANIFEST
make test       # pytest with coverage
make lint       # ruff + black --check + mypy
make toy        # run toy pipeline end to end (< 2 min)
make slice      # run the vertical-slice pipeline
make calibrate  # run calibration protocol from configs
make report     # compile reports with figures
make all        # env + data + lint + test + toy
```

## Report template (each phase report)

1. Purpose and research question addressed (RQ1–RQ7)
2. Inputs and versions (data, network, model, config hashes)
3. Method (brief, with assumptions flagged)
4. Results (with experiment class, sample sizes)
5. Uncertainty and sensitivity
6. Limitations
7. Items labelled: Observed fact / Model assumption / Inferred evidence / Simulation result / Uncertainty / Limitation
