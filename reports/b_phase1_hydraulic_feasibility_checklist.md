# Role B Phase 1 — Hydraulic feasibility checklist

**Status:** template only — **not assessed**
**Owner:** Role B
**Depends on:** Role A's data audit (technical-specs §5.1) and candidate catchment table
**Catchment recommendation:** **none** — this document deliberately contains no ranking, no score and no chosen catchment

## Why this is a template, not a result

Phase 1 Role B is asked to review audit outputs for hydraulic feasibility. Role A has
not produced an audit yet, so there is nothing to review. This checklist fixes the
questions and pass criteria **before** the audit arrives, so the review is not shaped
after seeing a preferred catchment.

Do not fill this in from imagery or intuition. Each row needs Role A's artifact.

## How to use it

For each candidate catchment in Role A's audit, copy the table and record the artifact
and page/layer that supports each verdict. Allowed verdicts:

- `PASS` — criterion met with a cited artifact
- `FAIL` — criterion not met with a cited artifact
- `INSUFFICIENT` — artifact missing or inconclusive (not the same as FAIL)

Never write a numeric feasibility score. Never treat a missing hydraulic attribute as
evidence that a drain does not exist (P3).

## Checklist

| # | Check | What to verify | Pass criterion | Required artifact | Verdict |
|---|---|---|---|---|---|
| 1 | Network connectivity | Connected components; dangling ends; gaps at 1, 2, 5, 10 m snap tolerance; whether a directed path to an outfall exists | Most links reach a plausible outfall; dangling ends and rejected features are documented, not silently deleted | A's network audit + `network_v<N>.gpkg` (`nodes`, `links`, `rejected`) | `INSUFFICIENT` |
| 2 | Hydraulic attributes | Which of diameter, capacity, invert, roughness, blockage, flow direction actually exist | Audit states explicitly what exists and what is missing; every missing attribute maps to a parameter group in `configs/params/ranges.yaml` | A's audit checklist §5.1, attribute inventory | `INSUFFICIENT` |
| 3 | Outlet and invert plausibility | Outfall at a terrain-plausible low point; invert elevations decrease downstream; no unexplained uphill links | At least one plausible outfall; downstream drops non-negative after the documented tolerance; exceptions flagged | A's network + DEM products; terminal-point check | `INSUFFICIENT` |
| 4 | Network size | Node and link counts for the candidate catchment | Tens to a few hundred nodes (target 10–500), consistent with the 1–3 catchment scope rule | A's candidate table | `INSUFFICIENT` |
| 5 | Rainfall-station proximity | KSNDMC stations inside or near the catchment; 15-min record completeness for candidate events | At least one station within a documented distance with usable 15-min data for the candidate events | A's station list and event compilation | `INSUFFICIENT` |
| 6 | Conceptual SWMM feasibility | Can links be represented as conduits or open channels without inventing topology? Are culverts, storage, weirs or pumps present and identified? | Most links map to a standard conduit/channel cross-section; special structures are documented and bounded | A's network + attribute inventory + imagery spot-check | `INSUFFICIENT` |
| 7 | Terrain support for runoff and surface spreading | Conditioned DEM, watershed boundary, depression/flow-connectivity products | DEM usable at terrain scale for subcatchment delineation and later surface spreading; 30 m resolution limit stated next to every use | A's DEM audit and terrain products | `INSUFFICIENT` |
| 8 | Event and observation availability | At least 2 calibration events and 1 held-out event, each with ≥ 5 geolocated observations | Gate 1 criterion met as written in `context/team-plan.md` §8 | A's observation dataset | `INSUFFICIENT` |

## What Role B will report back

For each candidate, a one-paragraph verdict tied to rows 1–7, plus:

- which hydraulic attributes must be guessed (expected: all of them);
- which rows in `configs/params/ranges.yaml` those guesses hit;
- whether the network topology is complete enough that a SWMM model would test
  drainage representation rather than test data repair.

Row 8 is a Gate 1 decision owned by the team, not by Role B alone.

## Limitation

This checklist cannot distinguish a data gap from a real drainage gap. A missing
diameter or invert is a **documentation** problem; a DEM mismatch is a
**terrain-scale inconsistency**, not proof that a drain is absent or blocked (P3).
