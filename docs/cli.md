# CLI

The Awareness Framework CLI is an optional helper. The framework does not require a tool, but the CLI reduces how much methodology an agent must keep in context.

Instead of asking every agent to remember the full protocol, use commands that check and maintain private files.

## Install From The Repository

```bash
npm install -g git+https://github.com/fyso-dev/awareness-framework.git
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
- `evaluations/`

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

Shows the current focus and warnings.

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
  --next "Run tests and open a PR"
```

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

Prints a handoff snapshot from the awareness board.

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

The CLI does not automatically change the framework. Repeated findings should become reviewed framework changes.

## Personality Commands

Personality is stored privately in `~/.agents/memory/personality.md`.

```bash
awareness personality show
awareness personality note --text "User prefers concise Spanish status updates" --evidence "Repeated feedback"
awareness personality adopt --text "Use direct, pragmatic Spanish for work updates" --evidence "User confirmed preference"
```

Candidate observations are cheap to record. Accepted traits should come from repeated evidence or explicit user confirmation.
