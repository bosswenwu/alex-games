# Sandsea device session — [date, anonymized device label]

## Preconditions

- Repo/commit loaded on device: [exact SHA and how verified]
- Issue #11 claim / PR (if implementing): [URL or planning-only]
- Device model / SoC / GPU: [confirmed model, omit serial/owner data]
- OS / browser / refresh rate: [version, Hz]
- WebGL renderer / actual canvas pixels / CSS viewport / DPR: [values]
- Scene: [seed, idle or reproducible *real* encounter; if synthetic, mark injected setup]
- Graphics/render distance / DevTools/screencast / power / thermal state: [values]
- Baseline and candidate SHA: [must be different for comparison]
- World load/compilation complete at: [time]
- Manual warmup: [start/end time, ≥10s; monitor does not prove this]

## Raw runs (one scene/version per series)

| Revision | Run | 30s duration / foreground | p50 / p95 ms | Longest >33.3ms streak | Particle peak / dynamic cap | Graphics/canvas change | JSON path / video |
|---|---:|---|---|---|---|---|---|
| [SHA] | 1 | [valid or reason] | [numbers/null] | [ms] | [n/n] | [yes/no] | [links] |
| [SHA] | 2 | [valid or reason] | [numbers/null] | [ms] | [n/n] | [yes/no] | [links] |
| [SHA] | 3 | [valid or reason] | [numbers/null] | [ms] | [n/n] | [yes/no] | [links] |

## Review and handoff

- Comparator command, gate, exit code, notes and p95 median delta: [raw result]
- GPU utilization / thermal from *independent* OS/vendor tool: [source or **unmeasured**]
- Human telegraph/touch A1–A7 result: [record or **unmeasured**]
- Invalid runs and redo reasons: [hidden, aborted, renderer/canvas/settings mismatch, etc.]
- Decision: [evidence-backed next action; do not mark P1 complete with missing physical/human checks]
- Privacy review before sharing UA, device metadata or videos: [done/not shared]
