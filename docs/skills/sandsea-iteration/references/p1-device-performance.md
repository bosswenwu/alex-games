# P1 real-device performance cycle (Sandsea)

Read this reference when planning or executing Sandsea P1 profiling, low-end GPU acceptance, performance-tool changes, or a performance-related PR. Treat repo paths, scripts, test counts, device capabilities, and numeric thresholds as **refresh-required** facts; the active repo/Issue #11 takes priority.

## Route and evidence classes

1. Confirm active execution device and repo; `git status`, fetch `origin/main`, inspect Issue #11/open PRs. Planning alone is not a claim; changing tools/game code needs a scoped Issue claim and isolated branch.
2. Classify evidence before work: **headless SwiftShader** = code/renderer smoke only; **real-browser page-side rAF** = frame interval proxy, not GPU utilization; **hardware GPU/thermal** = external OS/vendor trace if supported; **human touch/readability** = actual user/device test. Never promote one class into another.
3. Select an actually identified low-end device: anonymized label, model/SoC/GPU, OS/browser version, renderer string, refresh rate, screen/DPR, actual WebGL canvas pixels, graphics/render distance, seed, camera, page revision, temperature/power context. Online Desktop availability alone does not establish low-end GPU status.
4. Serve a fixed SHA to the device; verify the loaded revision. For Android Chrome follow official remote debugging instructions. Avoid screencast during timed runs; maintain the same DevTools/debugging overhead between versions.
5. Capture one scenario per series: idle versus a clearly specified real encounter; `charge3-natural` only if 3 naturally encountered scarabs are observed. A controlled test-only injected scene must be labelled synthetic. Do not reuse headless forced-visibility, boosted-HP, disabled-autoscale values as natural-device results.
6. After world load/compilation, manually warm up ≥10s and log it; current `device-monitor.js` records 30s page-side data but does **not** automatically prove that the prior warmup occurred. Run ≥30s ×3 for each version/scenario with a visible foreground page and separate scene/graphics files. Download raw JSON and check privacy before sharing.
7. Compare only same device/renderer/browser/seed/scenario/graphics/render distance/viewport/DPR/**canvas pixels**. Reject missing canvas or generic/software renderer for provisional real-GPU classification. `compare-device.mjs --require-30fps` returns 0 provisional, 2 review, 3 not comparable. Even exit 0 needs human gameplay and independent GPU/thermal evidence.
8. If the candidate p95 frame-time median worsens beyond the currently agreed ceiling (historical proposal: 10%), slow-interval streak reaches 5s, particles exceed dynamic cap, or runtime errors appear, investigate on hardware. Test only one fix at a time, repeat matched before/after, full selftest and visual check; do not silently alter game controls, saves or telegraph visibility.
9. Leave unsupported metrics as null/unmeasured; do not call absent long-task or thermal evidence zero. Record the actual merge/PR state; create an unmerged PR and Issue #11 handoff. Merge only on explicit user authorization.

## Existing tools and test commands (run from current repo root)

```bash
node tools/headless.mjs selftest
node tools/headless.mjs selftest 'games/minecraft/?seed=424242'
node tools/sandsea-perf/test-monitor.mjs
node tools/sandsea-perf/test-compare.mjs
node tools/sandsea-perf/baseline.mjs --scenario charge3 --gfx 0 --warmup 2 --duration 4 --repeat 1 --out /tmp/sandsea-smoke.json
node tools/sandsea-perf/compare-device.mjs --baseline /path/to/before.json --candidate /path/to/after.json --require-30fps
```

The 2s/4s headless command is a *tool smoke*, never an acceptance baseline. For device operation, inject `tools/sandsea-perf/device-monitor.js` into an already-running game page; call `__sandseaPerf.start({seconds:30,label:'anonymous-device',scenario:'charge3-natural',revision:'<exact-sha>'})` after warmup and `downloadAll()` after ≥3 runs. The comparer does not create physical measurements or certify GPU utilization. Use [templates/device-session.md](../templates/device-session.md) for the operator record and recheck the repo's current performance guide before invoking scripts.

## Edge cases to exercise

- Interleaved versus adjacent >33.3ms intervals: continuous slow streak must use **chronological** samples, percentiles may sort a copy. Hidden→visible is still invalid.
- Same CSS viewport but different canvas pixels, unknown/SwiftShader renderer, missing seed/revision, changed browser or graphics, short/aborted run, runtime errors, dynamic particle cap breach, and insufficient 3-run series must not report unconditional PASS.
- On a low-end 90/120Hz screen, record actual refresh and pixel size. Treat rAF-derived <30 FPS as a proxy; use Chrome Performance traces and OS/vendor counters where available, not an invented JS GPU percentage.
