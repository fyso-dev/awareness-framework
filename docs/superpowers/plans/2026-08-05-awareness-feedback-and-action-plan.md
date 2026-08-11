# Awareness Framework: Feedback Analysis & Action Plan (August 2026)

> **Context:** Feedback evaluation for Awareness Framework (Rating: 5/10). Identifies friction points, ceremony overhead, global focus drift across multi-repo workflows, and memory ROI.
>
> **Revision (2026-08-05, second pass):** Every claim below was re-checked against `awareness stats`, `awareness memory stats`, and the source. Five of six pain points are confirmed with a sharper root cause than originally recorded. **One (#3, memory ROI) had the wrong root cause and its recommendation is reversed.** Verified evidence is inline.

---

## 1. Summary of Feedback & Current State

While key features like `awareness status`, `awareness handoff`, worklogs, and `awareness stats` provide cross-environment continuity (Claude & Codex), the current implementation introduces unnecessary ceremony and operational friction.

### Strengths Retained
- `awareness status` (session continuity)
- `awareness handoff` (durable summaries)
- Task-focused worklog reconstruction
- `awareness stats` (observability & evidence-based diagnostics)
- Explicitly promoted long-term memory
- Local & private storage (`~/.agents`)

### Measured baseline (7d: 2026-07-30 → 2026-08-05)

| Metric | Value |
| --- | --- |
| Sessions started | 210 (claude=1871 / codex=443 hook events) |
| Hook events | 2314 |
| Compactions | 54 |
| Worklog entries | 324 across 9 distinct tasks / **13 distinct repos** |
| Memory trigger calls | 237 → **0 injected, 237 skipped** |
| Recall calls | **0** |
| Candidates / promotions | 3 / 0 |
| Memory scorecard | **0/10** |
| Storage | 54.6 MB total (runtime 53.5 MB, worklog 1.0 MB) |

The 13-repos-vs-1-global-focus ratio is the quantitative form of pain point #1.

---

## 2. Verified Pain Points & Root Causes

### 1. Stale/misleading focus across repos — CONFIRMED
**Root cause: there is no repo/branch detection anywhere in the codebase.** `src/cli.js:297` takes `repo`/`branch` exclusively from CLI flags and defaults them to `'Unspecified'`. No `git rev-parse` call exists in `src/`. Focus is a hand-typed global variable that only changes when someone remembers to run `awareness focus`.

Reproduced during this analysis: `awareness status` in `awareness-framework` on `main` reported `fyso/opensource-ingest` on `agent/refactor-local-runner-desktop`. The tool asserted a wrong repo and branch with no hedge and no warning.

### 2. Excessive ceremony & sandbox latency — CONFIRMED (as designed)
`templates/agent-instructions.md` plus the `UserPromptSubmit` hook mark `awareness log` and `awareness handoff` as `OBLIGATORIO` on every turn, with no notion of turn weight. A one-line answer carries the same protocol cost as a multi-hour refactor.

### 3. Memory ROI — CONFIRMED ZERO, **root cause was wrong**
The original reading was "the infrastructure is active but its practical value is zero." That is not what happened. **The infrastructure was never switched on.**

- `awareness memory stats` → `Skip reasons: AI trigger provider not configured=237`, `By provider: none=237`.
- `src/memory-trigger.js:106-115`: when `AWARENESS_MEMORY_TRIGGER_COMMAND` is unset, the trigger returns `shouldRecall:false, provider:'none'` immediately. No decision is ever made.
- Verified in this environment: `AWARENESS_MEMORY_TRIGGER_COMMAND` is empty.
- `awareness memory setup` (`src/cli.js:445`) generates the decisor script, then only *prints* `export AWARENESS_MEMORY_TRIGGER_COMMAND=...` (`src/cli.js:655`). Nothing persists it to a shell profile or to a config file the hook reads. The feature is opt-in via an instruction a human has to notice and copy.

So all 237 "evaluations" were no-ops on a disabled path, and `awareness stats` presented that disabled state as 237 trigger *calls* against 0 injections. **The framework's own telemetry manufactured the impression that memory tried 237 times and found nothing useful.** This is the same defect class as pain point #1: confidently reporting a state that isn't real.

The 0/10 scorecard is therefore not evidence that memory is worthless — it is unfalsifiable. It measures a switch that is off.

**Consequence for the plan:** "stop expanding memory until recall proves value" is right about not expanding, but the blocking action is not *more evidence*, it is *turning the feature on so evidence can exist at all*.

### 4. Volume over synthesis — CONFIRMED, with a sharper cause
`~/.agents/awareness/current.md` is **678 lines / 22.7 KB (~5.7k tokens)** and is injected verbatim into every session through the `@path` import in `CLAUDE.md` — 210 times in 7 days.

Two compounding defects:
- **42 of 43 task blocks have `Focus updated.` as their only `Done:` content.** The board records *that focus changed*, not *what was done*. The bulk of the injected payload carries no information.
- **18 of 43 blocks are `State: done` but still sit under Active Tasks.** There is no archive or prune command in the 36-command surface.

The problem is not that volume outgrew synthesis. It is that the write path emits a placeholder and the read path never retires anything.

### 5. Repetitive / non-actionable warnings — CONFIRMED
`collectWarnings` (`src/cli.js:1648-1680`) is a pure existence-and-regex check over files. It receives no session age and no time of day, so `'Daily worklog has no entries.'` (`src/cli.js:1679`) fires identically at 00:01 and at 18:00. Corroborating signal: scheduled runs report `Warnings (latest/max over 2440 samples): 1/1` — one warning present on every sample for a week, never actioned. That is warning fatigue with a measurement.

### 6. Out-of-context handoff replay — CONFIRMED, but derivative
Handoff re-renders the global board because there is no session/repo tier for it to write instead (#1) and nothing retires from the board (#4). Fixing #1 and #4 largely dissolves #6; it is not an independent defect.

---

## 3. Proposed Architectural Changes

### A. Context Hierarchy
Transition from a flat global focus to a structured 3-tier hierarchy:
```text
focus global (project / overarching goal)
  └── sesión / repo actual (auto-detected via git context)
       └── solicitud activa (current prompt / mini-task)
```
The session tier is *derived*, never written back over the global tier. `status` renders both and **explicitly flags divergence** rather than asserting the stale value.

### B. Frictionless Continuity & Material Handoffs
- Auto-detect current repo, branch, and active task from git.
- Record material handoffs automatically; drop the mandate for lightweight Q&A turns.
- Show diffs since the last handoff rather than repeating whole context states.
- Avoid requiring sandbox write approvals on session teardown/closing.

### C. Pragmatic Memory Strategy (revised)
- **Make the trigger provider real before judging it:** persist the config in `awareness memory setup` instead of printing an `export` line, and have `awareness check` warn when the provider is unconfigured.
- **Stop counting not-configured skips as trigger calls** in `stats`. A disabled path must read as disabled, not as 237 failed evaluations.
- Give the read path a trigger: nothing in the agent template ever instructs an agent to call `awareness recall` — only to credit one afterwards with `memory used`. Hence 0 calls.
- Freeze new memory surface area until the above yields at least one credited recall. Same conclusion as the original feedback, different blocker.

### D. Actionable Alerts & Synthesis
- Feed session age / time of day into `collectWarnings`; suppress or defer conditions that are normal early in a day or session.
- Every surviving warning names a command that resolves it, or it is deleted.
- Archive `done` task blocks out of `current.md`; cap the injected payload.
- Replace the `Focus updated.` placeholder with real change content, or omit the section.

### E. Telemetry vs. Evidence
Split `stats` output into *usage* (sessions, hooks, calls) and *benefit* (credited recalls, resolved warnings, handoffs that shortened a later session). Adoption counters must never occupy the position where value evidence is expected — pain point #3 is exactly what happens when they do.

---

## 4. Action Items & Implementation Roadmap

Ordered by impact ÷ cost, not by the order the feedback listed them.

- [x] **P0 — Cheap, self-contained, immediate context win** *(done 2026-08-11)*
  - [x] `awareness archive` retires `State: done` blocks to `awareness/archive/YYYY-MM.md`, never retiring the focused task. Dry-run on the live board: 19 of 43 blocks archivable.
  - [x] `Focus updated.` placeholder removed: `Done` is emitted only when real work exists, `log --changes` writes to the task's `Done`, and existing entries survive focus switches. Legacy placeholders are dropped when a block is rewritten.
  - [x] `memory setup` persists `memoryTriggerCommand` to `<home>/config.json`; the trigger resolves env → config. `status`/`check` report an unconfigured provider under a separate `Setup` section.
  - [x] `stats` splits trigger `calls` into `evaluated` vs `unconfigured` so a disabled provider no longer reads as failed evaluations.
- [x] **P1 (context detection) — landed with P0** *(done 2026-08-11)*
  - [x] `src/git-context.js` detects repo (`origin` slug, else worktree basename) and branch (`git branch --show-current`, which works on unborn branches).
  - [x] `focus` defaults `--repo`/`--branch` from git; explicit flags still win.
  - [x] `status` renders `Session Context` and names divergence instead of asserting the stored focus. Repos compare on the trailing segment so owner spelling does not cause false alarms.
  - [x] `hook run` injects the divergence warning at session start and on user prompts, so agents are told the focus may not apply.
- [ ] **P1 (remaining) — hierarchical focus model**
  - Persist the three tiers (`[global] → [repo/session] → [active prompt]`) rather than deriving the session tier on each read.
- [ ] **P2 — Reduced friction & auto-handoffs**
  - Make handoffs incremental (diff-based) instead of full-board replays.
  - Gate warnings on session age / time of day; make each one actionable or drop it.
  - Eliminate forced worklog prompts on lightweight turns.
- [ ] **P3 — Memory, gated**
  - No new memory surface until P0 lands and one credited recall exists.
  - Add a retention policy for `runtime/` (53.5 MB / 167 files, currently unbounded).

---

## 5. Conclusion

Awareness works as a continuity notebook and an observability layer; it does not yet work as agent memory. The highest current value is the worklog and `stats`. The core defect is a single global state that goes stale across 13 repos — and, newly identified, a memory path that is silently disabled while reporting activity, which is what made the memory subsystem look tested-and-worthless rather than never-run.
