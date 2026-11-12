export const STEPS = [
  {
    key: 'event',
    title: 'Event & location',
    short: 'What happened, where?',
    question: 'Which storm are we investigating, and where did it flood?',
    narration:
      'We start from a storm event and the places where flooding was reported. Everything on this map is synthetic: a made-up catchment with made-up reports, so we can show the workflow before the real data audit.',
    limits: [
      'Rainfall, reports and catchment are synthetic placeholders (experiment class B). They carry no real-world meaning.',
      'Real events will come from the Phase 1 data audit; the catchment is chosen only after that audit.',
      'A report location is approximate. An absence of reports does not mean an absence of flooding.',
    ],
  },
  {
    key: 'evidence',
    title: 'Infrastructure evidence',
    short: 'Can we trust the drain map?',
    question: 'Which parts of the official drainage map are supported, disputed or unverified?',
    narration:
      'The official map is treated as a claim, not a fact. Independent evidence (terrain, imagery, history, field checks) agrees or disagrees with it. We output an evidence status, never a probability.',
    limits: [
      'The DEM is terrain-scale evidence only. A mismatch means "inconsistent, worth investigating", never "this drain is missing or blocked".',
      'The evidence index counts agreeing sources. It is not a calibrated probability.',
      'Hydraulic parameters are ranges with provenance tags; in this demo all are assumed values.',
    ],
  },
  {
    key: 'baseline',
    title: 'Baseline simulation',
    short: 'What does the model flood?',
    question: 'Given the evidence, where does the drainage model flood, and does that match the reports?',
    narration:
      'Rainfall goes through a drainage model to give node flooding. Node flooding is not a flood map, so a separate surface-spreading step places that volume on the terrain before we compare with reports.',
    limits: [
      'The routing model here is a simplified stand-in for EPA SWMM; the real model replaces it in the vertical slice.',
      'Surface spreading is a volume-conserving local fill (about 170 m window). It does not route water across the catchment.',
      'Matching reports is a location-level check. The comparison resolution is about 120 m.',
      'SYN-3 is held out: it is never used to tune parameters.',
    ],
  },
  {
    key: 'counterfactual',
    title: 'Counterfactual',
    short: 'What if we fix it?',
    question: 'If one factor changed, how much would the simulated flooding change?',
    narration:
      'We change one factor at a time and re-run the drainage model. The difference from the baseline is the simulated effect of that factor, with new flooding shown in red if relief upstream pushes water downstream.',
    limits: [
      'Counterfactual conclusions must come from the physical model (SWMM), never from a surrogate.',
      'Effects are simulated under the assumed parameter ranges, not measured outcomes.',
      'Flood response can be non-monotonic: upstream relief can move or worsen flooding downstream.',
    ],
  },
  {
    key: 'interactions',
    title: 'Interactions',
    short: 'Do causes combine?',
    question: 'Are the factors additive, or do they interact?',
    narration:
      'With three factors we simply run all eight combinations. If the combined effect differs from the sum of single effects, the factors interact, and we do not force a single root cause.',
    limits: [
      'All 2^3 combinations are run directly. For more factors, approximate Shapley-style methods will be used.',
      'Shapley values share the combined effect fairly; they are not causal proof.',
      'Results depend on the assumed ranges and the chosen event.',
    ],
  },
  {
    key: 'uncertainty',
    title: 'Uncertainty',
    short: 'How sure are we?',
    question: 'Across plausible parameter scenarios, how robust is the conclusion?',
    narration:
      'Instead of one answer we sample 300 plausible scenarios from the parameter ranges. We report a scenario envelope and how often the intervention helps. It is a spread of scenarios, not guaranteed bounds.',
    limits: [
      'The envelope shows the 5th to 95th percentile of the sampled scenarios. It is not a guaranteed lower/upper bound.',
      'Only parameters with ranges are varied; structural errors (missing drains) are not sampled here.',
      'The sensitivity bars are rank correlations for this synthetic network, not a formal identifiability analysis.',
    ],
  },
  {
    key: 'ai',
    title: 'AI scalability',
    short: 'Does a GNN earn its place?',
    question: 'At what scenario volume does a graph neural network surrogate beat running the physical model directly?',
    narration:
      'The GNN is a speed-up experiment, not the source of truth. We report runtime, error, training cost and the break-even scenario count. Every number on this page is a placeholder until the real benchmark.',
    limits: [
      'All timings and errors on this page are illustrative placeholders. Nothing here has been measured or trained.',
      'The surrogate screens scenarios only. Shortlisted candidates are re-run in SWMM before any conclusion.',
      'The graph topology stays fixed; topology-changing interventions are out of scope for the first version.',
    ],
  },
]

export const EVIDENCE_LABELS = {
  terrain: {
    consistent: ['Terrain-flow corridor broadly follows the mapped drain', 'agree'],
    inconsistent: ['Terrain-flow corridor diverges from the mapped drain (worth investigating)', 'disagree'],
    weak: ['Terrain signal too weak at DEM scale to say', 'neutral'],
  },
  imagery: {
    visible: ['Drain visible in satellite imagery', 'agree'],
    not_visible: ['Drain not visible (may be covered)', 'disagree'],
    unavailable: ['No usable imagery', 'neutral'],
  },
  hist: {
    consistent: ['Past flooding pattern consistent with the mapped capacity', 'agree'],
    suggests_restriction: ['Past flooding suggests restricted capacity downstream', 'disagree'],
    no_data: ['No historical flood behaviour on record', 'neutral'],
  },
  conn: {
    ok: ['Connectivity consistent with watershed structure', 'agree'],
    dead_end: ['Network ends where terrain says water cannot leave', 'disagree'],
    unclear: ['Connectivity unclear at this junction', 'disagree'],
  },
  obs: {
    none: ['No direct field observation', 'neutral'],
    verified_ok: ['Field audit: clear and functioning', 'agree'],
    verified_impaired: ['Field audit: partly silted (synthetic)', 'disagree'],
  },
}
