---
name: sandsea-iteration
description: Repeatable engineering workflow for the Sandsea single-file WebGL voxel game. Use when planning, implementing, testing, documenting, coordinating, or opening a PR for gameplay or performance changes in bosswenwu/alex-games/games/minecraft/index.html.
---

# Sandsea Iteration

Use this skill to carry one Sandsea game slice from scope and coordination through implementation, deterministic checks, visual review, documentation, and an unmerged PR. Apply it only after refreshing the active workspace and repository state; do not trust paths, branches, claims, or PR states inherited from an earlier session.

## Decide the requested mode

- **Plan only:** analyze the current roadmap and repository state, create a dated task/validation plan, and do not edit game code, claim Issue #11, or open a PR unless requested.
- **Implementation:** follow the complete workflow below. Keep one gameplay slice per branch/PR.
- **Post-merge:** only merge after explicit user approval, then verify `main` and record the result.

## Non-negotiable project rules

- Keep the playable game in `games/minecraft/index.html`: single file, zero runtime dependencies, directly runnable.
- Treat GitHub Issue #11 as the coordination source of truth for local/cloud AI work. Inspect the latest comments and open PRs before claiming anything; make the claim specific (goal, files/functions, tests, non-goals, branch). Never overlap another active claim.
- Work on an isolated feature branch from fresh `origin/main`. Preserve a dirty or unfamiliar working tree; never overwrite, reset, stash, or delete another agent's work without authorization.
- Preserve old saves. Do not add save fields, blocks, controls, hotbar/recipe entries, or change another enemy's AI unless the user's scope and Issue #11 explicitly cover them. If persistence must change, add old/missing/malformed-value and save-load round-trip tests.
- Add no external runtime dependencies. Reuse existing attack/damage and render paths; keep per-frame allocations bounded.
- Create or update PRs as requested, but **never merge without explicit user approval**. Clearly disclose human/device/performance checks that automation cannot establish.

## Sequential engineering workflow

1. **Refresh context.** Confirm the active environment, repository identity, `git status`, current branch, and remote refs. Read `AGENTS.md`; inspect current `origin/main`, Issue #11, open PRs, and current `ROADMAP.md`/`BACKLOG.md`. If the workspace is stale, dirty, or another claim overlaps, stop and resolve ownership before editing.
2. **Claim and specify.** For implementation, post a concise Issue #11 claim before coding. State player-visible behavior, exact state transitions and numeric bounds, target/attack eligibility, cancellation/reset paths, mobile UI, persistence impact, tests, and explicit non-goals. For a plan-only request, skip the claim and make that distinction explicit.
3. **Record baseline.** Run `node tools/headless.mjs selftest` on the untouched branch and note the assertion count. Choose at least one fixed world seed relevant to the feature; use `?seed=424242` as the established baseline unless the current project documentation specifies otherwise.
4. **Implement minimally.** Modify only the agreed files. Prefer deterministic helpers and explicit state transitions. Ensure death, pause, respawn, new-world, timeout, target removal, interruption, and invalid-target paths clean up temporary state. Keep debug access read-only and keep transient state out of saves.
5. **Add deterministic regression coverage.** Cover the normal flow, bounds, wrong target, repeated use, expiry, interruption, ordinary versus tagged attacks, environmental damage boundaries, and save compatibility where relevant. Tests must assert intended behavior; do not fix flakes by weakening assertions. Keep selftest setup isolated and restore mobs, player state, particles, settings, and storage in `finally` blocks.
6. **Run the full checks.** Run `node tools/headless.mjs selftest`, then the fixed-seed form such as `node tools/headless.mjs selftest 'games/minecraft/?seed=424242'`. Repeat when timing/randomness is involved. Run `git diff --check`; record exact assertion counts and renderer. Do not present SwiftShader results as real-GPU performance results.
7. **Capture and inspect visuals.** Use the existing headless runner, for example:
   ```bash
   node tools/headless.mjs shot 'games/minecraft/?seed=424242' /tmp/sandsea-desktop.png --size 1280x720 --script /tmp/scene.js
   node tools/headless.mjs shot 'games/minecraft/?seed=424242' /tmp/sandsea-touch.png --size 844x390 --script /tmp/scene.js
   ```
   Create a deterministic scene script when a feature state is otherwise difficult to reach. Read the resulting images and inspect readability, viewport clipping, overlap, contrast, and console/runtime errors. Use portrait capture when orientation or narrow layout matters. Distinguish scripted scene setup, simulated touch, actual device input, and human timing tests.
8. **Document and hand off.** Add player-facing behavior and exact verification to `GAME-CHANGELOG.md`; append, never rewrite other agents' sections in `BACKLOG.md`; update/index `ROADMAP.md` or its dedicated plan where needed. Use [`templates/iteration-record.md`](templates/iteration-record.md) for claim/handoff structure. Before publishing the handoff, refresh Issue #11 so the summary does not conflict with newer work.
9. **Publish an unmerged PR.** Fetch `origin` again, confirm the branch diff is scoped and clean, commit, push, create/update one reviewable PR, and include implementation scope, tests, screenshots, compatibility, performance caveats, and unverified human checks. Post the PR URL and next-step boundary to Issue #11. Verify remote head equals local head, working tree is clean, PR is open, and `main` was not changed. Do not claim CI passed if no checks are configured.
10. **After approval only.** Merge only the approved PR, then fetch/switch to `main`, verify the merge commit and clean worktree, rerun the appropriate tests, and append the result to Issue #11.

## Planning P1–P5

For a new cycle, read the current project roadmap first; do not assume a dated plan is still current. Use the plan to sequence: **P1 performance/balance → P2 one contrasting enemy behavior → P3 bounded progression sink → P4 replayable micro-ruin → P5 release stabilization**. Start only the next unblocked phase, give it one Issue #11 claim and one PR, and make each phase's automated, visual, human, persistence, and performance acceptance criteria explicit. See the delivered project plan for the current detailed breakdown; refresh it from code and GitHub before reuse.

## Completion checklist

- [ ] Scope claimed (or explicitly plan-only) and non-goals recorded.
- [ ] Baseline and fixed-seed selftests pass; deterministic tests cover edges.
- [ ] `git diff --check` passes; screenshots were opened and visually reviewed.
- [ ] Changelog, append-only backlog, roadmap/plan, and Issue #11 handoff are current.
- [ ] PR URL, local/remote commit equality, clean worktree, open/unmerged status, and outstanding human checks are reported.
