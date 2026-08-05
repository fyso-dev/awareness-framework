# Awareness Framework: Feedback Analysis & Action Plan (August 2026)

> **Context:** Feedback evaluation for Awareness Framework (Rating: 5/10). Identifies friction points, ceremony overhead, global focus drift across multi-repo workflows, and memory ROI.

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

### Critical Pain Points
1. **Stale/Misleading Focus across Repos:** Single global focus state remains pinned to past repos/tasks (e.g. showing `fyso/opensource-ingest` when working on `sonar-alt`), causing initial context noise.
2. **Excessive Ceremony & Sandbox Latency:** Requiring manual worklogs/handoffs and sandbox approvals for minor interactions adds friction.
3. **Unproven Memory Value (Zero ROI):** High trigger evaluation counts (231 evals) yielding 0 injected memories / zero-use recalls means active background infrastructure without practical value.
4. **Volume over Synthesis:** High activity (204 sessions, 323 worklogs, 2.3k hook events) turns logs into raw activity dumps rather than concise summaries.
5. **Repetitive / Non-Actionable Warnings:** Alerts like "today's worklog is empty" trigger prematurely on session start.
6. **Out-of-Context Handoff Replay:** Handoffs reinforce stale global state rather than capturing active sub-context.

---

## 2. Proposed Architectural Changes

### A. Context Hierarchy
Transition from a flat global focus to a structured 3-tier hierarchy:
```text
focus global (project / overarching goal)
  └── sesión / repo actual (auto-detected via git context)
       └── solicitud activa (current prompt / mini-task)
```

### B. Frictionless Continuity & Material Handoffs
- Auto-detect current repo, branch, and active task automatically.
- Record material handoffs automatically without requiring manual logging for lightweight Q&A.
- Show diffs since the last handoff rather than repeating whole context states.
- Avoid requiring sandbox write approvals on session teardown/closing.

### C. Pragmatic Memory Strategy
- Halt non-essential memory expansions until a proven recall case demonstrates improved decision quality.
- Differentiate usage telemetry (runs, trigger evaluations) from evidence of benefit (credited recall hits).

### D. Actionable Alerts & Synthesis
- Convert raw condition warnings into actionable prompts or suppress them during early session initialization.
- Consolidate raw log volume into periodic synthesized summaries.

---

## 3. Action Items & Implementation Roadmap

- [ ] **Phase 1: Multi-Repo & Hierarchical Context**
  - Implement auto-detection for repo/branch in `src/cli.js` & hooks.
  - Extend focus model to support `[global] -> [repo/session] -> [active prompt]`.
- [ ] **Phase 2: Reduced Friction & Auto-Handoffs**
  - Make background handoffs incremental (diff-based).
  - Eliminate forced worklog prompts on lightweight turns.
- [ ] **Phase 3: Warning Refinement & Memory Gate**
  - Clean up premature warnings on fresh sessions.
  - Add explicit utility gates for memory injection.
