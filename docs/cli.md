# CLI

The Awareness Framework CLI is an optional helper. The framework does not require a tool, but the CLI reduces how much methodology an agent must keep in context.

Instead of asking every agent to remember the full protocol, use commands that check and maintain private files.

## Install

```bash
npm install -g @fyso/awareness-framework
```

See [Install](install.md) for first-run setup, wrapper initialization, updates, and custom paths.

For local development:

```bash
npm install
npm test
npm link
```

## Private State

By default, commands use:

```text
~/.agents/
```

Override with:

```bash
awareness status --home /path/to/private/agents
```

or:

```bash
AGENTS_HOME=/path/to/private/agents awareness status
```

Use channel-scoped state for multi-channel integrations:

```bash
awareness status --channel support
```

This resolves to:

```text
~/.agents/channels/support/
```

Use `--agent-folder` as a clearer alias when the path is a base folder:

```bash
awareness status --agent-folder /path/to/agents --channel support
```

User memory is narrow and separate from the channel context. It lives under `memory/users/` inside the selected channel or base folder.

## Session Bootstrap vs Operational Refresh

Instruction-file imports are a bootstrap mechanism. They can load a snapshot of `current.md` at session start, but they do not guarantee that an agent sees updates made later by another agent.

Use the CLI as the operational refresh and maintenance layer:

- At session start, run `awareness status` or `awareness check` when the CLI is available.
- If the session may be stale because another agent worked in parallel, run `awareness refresh`.
- Before handoff, run `awareness handoff` or `awareness check`.
- When changing state, prefer `awareness focus` and `awareness log` over manual edits.

If the CLI is not available, read `~/.agents/awareness/current.md` directly.

## Commands

### `init`

Creates the private directory structure and starter files if they do not exist.

```bash
awareness init
```

Creates:

- `AGENTS.md`
- `awareness/current.md`
- `worklog/YYYY-MM-DD.md`
- `memory/personality.md`
- `memory/preferences.md`
- `memory/patterns.md`
- `memory/long-term.md`
- `evaluations/`
- `runtime/`

Create regular wrapper files for Codex, Claude Code, OpenCode, and Pi:

```bash
awareness init --wrappers
```

Existing wrappers are preserved. To replace them intentionally:

```bash
awareness init --wrappers --overwrite-wrappers
```

Use custom roots for tests or non-standard machines:

```bash
awareness init --wrappers \
  --home /path/to/.agents \
  --user-home /path/to/user-home \
  --config-home /path/to/config-home
```

### `status`

Shows the current focus and warnings. Warnings are printed but do not make the command fail; use `awareness check --strict` when automation should fail on warnings.

```bash
awareness status
```

### `refresh`

Reloads the awareness board from disk and prints the current status. This is an alias for `status` with a name that makes the cross-agent refresh intent explicit.

```bash
awareness refresh
```

### `check`

Checks whether private state is maintainable.

```bash
awareness check
awareness check --strict
```

Use `--strict` in automation when warnings should fail the command.

### `focus`

Updates `Current Focus`, upserts the task in `Active Tasks`, and appends a worklog entry.

```bash
awareness focus \
  --task PROJECT-123 \
  --summary "Agent awareness framework" \
  --repo fyso-dev/awareness-framework \
  --branch codex/cli-and-personality \
  --state in-progress \
  --next "Run tests and open a PR"
```

Valid states are `started`, `in-progress`, `paused`, `blocked`, `waiting`, `done`, `in-review`, and `ready`. Underscore aliases such as `in_progress` and `in_review` are accepted and normalized.

### `log`

Appends a concrete progress entry to the daily worklog.

```bash
awareness log \
  --task PROJECT-123 \
  --summary "Added CLI helper" \
  --changes "Implemented init, status, check, focus, log, handoff, evaluate, and personality commands." \
  --evidence "src/cli.js"
```

### `handoff`

Prints a handoff snapshot from the awareness board. Like `status`, warnings are informational and return exit code 0.

```bash
awareness handoff
```

### `evaluate`

Builds a private daily evaluation note using simple heuristics.

```bash
awareness evaluate
awareness evaluate --print
awareness evaluate --force
```

When an evaluation is written, the CLI also records low-risk promotion candidates in `memory/long-term.md`. It does not silently promote candidates into durable rules; use `awareness memory promote` after review.

### `memory`

Reviews and promotes long-term memory.

```bash
awareness memory show
awareness memory candidates
awareness memory review
awareness memory review --min-count 3
awareness memory note --text "User prefers active memory review" --evidence "Direct request"
awareness memory promote --kind preference --text "Surface memory candidates proactively" --evidence "User confirmed"
awareness memory used --text "Prefer recall before repeating implementation work" --note "Saved a duplicate effort"
awareness memory used --key a1b2c3 --note "The curated entry directly informed this fix"
awareness memory stats --since 7d
awareness memory stats --since all --json
awareness memory stats --since 30d --snapshot
```

`memory show` prints the curated long-term memory (Preferences, Patterns, Project Conventions, Review Guidance) grouped by section. Empty sections, raw promotion candidates, and pruned or revised entries are omitted, so it is a quick read-only view of what is actually durable.

`memory review` scans promotion candidates and suggests repeated candidates as `pattern` promotions once they appear at least twice by default.

`memory candidates` lists active promotion candidates only. Text that has been pruned or revised remains in the Markdown history but is hidden from active candidates, excluded from suggestions, and rejected by `memory promote`.

Valid promotion kinds are `preference`, `pattern`, `project`, and `review`.

`memory used` credits a curated long-term entry that actually helped a task. Use `--text` to match by content or `--key` to target the deterministic entry key shown in `memory stats --json`; add an optional `--note` to explain why the memory mattered. Each use appends a `memory.used` event to `memory/events.jsonl` with the matched key, the curated text, and the note.

`memory stats` summarizes whether stored memory is healthy, utilized, and useful. The command accepts `--since today`, `--since 7d`, `--since 30d`, or `--since all`, prints text by default, emits machine-readable JSON with `--json`, and appends the aggregate snapshot to `runtime/metrics/YYYY-MM-DD.jsonl` with `--snapshot`.

Reported levels:

- **Store health** — conversion from candidates to durable memory, source mix, churn, density, and freshness indicators.
- **Utilization** — how often curated entries are recalled, which entries are workhorses, dead-weight entries that were never recalled, recall rate per session, and repeated zero-result queries as the gap detector.
- **Outcome** — how often recalled entries are later credited with `memory.used`, plus contradictions or stale signals around those credited entries.
- **Scorecard** — a composite summary that rolls the levels into a quick read on activation, precision, outcome, freshness, and overall usefulness.

`runtime/recall/YYYY-MM-DD.jsonl` records the usage side of `recall`, including `curatedHits` when the recall matched curated long-term entries. `curatedHits` is an array of deterministic entry keys, so the same key can be attributed across multiple recalls without depending on line numbers or text formatting. Older recall events may not have this field; those rows simply count as unattributed history.

### Local memory operations

These commands provide a small Cognee-inspired operation vocabulary without adding a graph database or vector store.

```bash
awareness remember --text "Prefer recall before repeating implementation work" --evidence "User request"
awareness recall "implementation work"
awareness forget --text "Old assumption" --reason "Superseded by user correction" --evidence "Correction message"
awareness improve
```

`remember` records a promotion candidate and appends `memory.candidate.created` to `memory/events.jsonl`.
`recall` performs local text search across memory, memory events, worklogs, and evaluations using an in-memory MiniSearch index. Matching is case- and accent-insensitive, supports prefix/fuzzy matches, preserves local-only privacy, and still includes a small curated alias set for common English/Spanish memory terms.
`forget` records a prune/revision entry and appends `memory.pruned`; it does not destructively delete historical evidence, but pruned text is inactive for candidate review and promotion.
`improve` runs the evaluation/review loop and appends `evaluation.created` and `pattern.suggested` events when applicable. Auto-generated evaluation candidates are deduplicated by text across days so recurring diagnostics do not flood human-curated candidates.

`recall` also appends a usage event to `runtime/recall/YYYY-MM-DD.jsonl` (`source`, `query`, `terms`, `resultCount`, `topFiles`, and `curatedHits` when available). These hits feed the recall metrics in `awareness stats`; queries with `resultCount: 0` highlight memory gaps.

### `stats`

Aggregates the events and state the CLI already records into a usage report. It is read-only over the local private state and never posts anywhere.

```bash
awareness stats                       # default window: last 7 days
awareness stats --since today
awareness stats --since 30d
awareness stats --since all
awareness stats --json                # machine-readable for dashboards/pipelines
awareness stats --snapshot            # also append the aggregate to runtime/metrics/YYYY-MM-DD.jsonl
```

Reported metrics:

- **Sessions & hooks** — sessions started, total hook events, compactions, and a per-tool breakdown (from `runtime/hooks`).
- **Scheduled runs** — counts by cadence and the warnings trend (from `runtime/schedule`).
- **Memory** — candidates created (by source), promotions (by kind), prunes, and pattern suggestions (from `memory/events.jsonl`).
- **Recall (hits)** — calls, average results per call, zero-result queries, repeated zero-result queries, and the most frequent queries and matched files (from `runtime/recall`).
- **Activity** — worklog entries, distinct tasks, and distinct repositories in the window (from `worklog/*.md`).
- **Storage** — file count and bytes per area, computed on demand.

`--snapshot` persists the full aggregate as one JSON line per run, giving a time series for growth charts without recomputing history. `--since` accepts `today`, `7d`, `30d`, or `all`; window filtering is by date so partial-day boundaries are inclusive of the whole day.

### `hook run`

Records a lightweight lifecycle event from an agent CLI hook.

```bash
awareness hook run --tool codex --event session-start
awareness hook run --tool claude --event pre-compact --quiet
awareness hook run --tool opencode --event session.idle
```

This writes JSON lines under:

```text
~/.agents/runtime/hooks/YYYY-MM-DD.jsonl
```

Hook events do not append to the daily worklog. Use `awareness log` for human-relevant progress.

### `hook install`

Installs supported hook integrations.

```bash
awareness hook install --tool all --command "$(command -v awareness)"
awareness hook install --tool codex --command "$(command -v awareness)"
awareness hook install --tool claude --command "$(command -v awareness)"
awareness hook install --tool opencode --command "$(command -v awareness)"
```

Generated files:

- `~/.codex/hooks.json`
- `~/.claude/settings.json`
- `~/.config/opencode/plugins/awareness-framework.js`

Use an absolute `--command` path when hooks run outside an interactive shell.

For OpenCode, `--overwrite` replaces an existing non-generated plugin file. Use it only when that file is intentionally managed by this framework.

### `schedule run`

Runs periodic maintenance.

```bash
awareness schedule run --cadence hourly
awareness schedule run --cadence daily
```

Hourly runs record warnings under `runtime/schedule/`. Daily runs also create `evaluations/YYYY-MM-DD.md` if it does not exist.

### `schedule install`

Installs macOS LaunchAgents for global periodic execution.

```bash
awareness schedule install --cadence all --command "$(command -v awareness)"
awareness schedule install --cadence all --command "$(command -v awareness)" --load
```

Generated files:

- `~/Library/LaunchAgents/dev.fyso.awareness.hourly.plist`
- `~/Library/LaunchAgents/dev.fyso.awareness.daily.plist`

See [Hooks and Scheduling](hooks-and-scheduling.md) for tool-specific notes.

### `user show`

Shows narrow memory for a user. If `--channel` is provided, memory is read from that channel's private state.

```bash
awareness user show --user user-123
awareness user show --channel support --user user-123
```

### `user note`

Appends a small evidence-backed fact about a user.

```bash
awareness user note \
  --channel support \
  --user user-123 \
  --kind question \
  --text "Asked how worklog automation should be organized" \
  --evidence "Message link or timestamp"
```

Supported kinds:

- `nickname`
- `question`
- `topic`
- `preference`
- `fact`
- `note`

User notes do not create a full awareness workspace for that user. Channel context remains in `awareness/` and `worklog/`; user memory remains in `memory/users/<user>.md`.

## Personality Commands

Personality is stored privately in `~/.agents/memory/personality.md`.

```bash
awareness personality show
awareness personality note --text "User prefers concise Spanish status updates" --evidence "Repeated feedback"
awareness personality adopt --text "Use direct, pragmatic Spanish for work updates" --evidence "User confirmed preference"
```

Candidate observations are cheap to record. Accepted traits should come from repeated evidence or explicit user confirmation.
