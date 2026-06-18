# Install

This page installs the optional Awareness Framework CLI and initializes private local state.

The framework can still be used manually from templates. The CLI is recommended when agents should maintain awareness and worklogs through commands instead of keeping the full methodology in context.

## Requirements

- Node.js 20 or newer
- Git access to `github.com/fyso-dev/awareness-framework`
- A shell where global npm binaries are on `PATH`

Check Node:

```bash
node --version
```

## Install The CLI

Install from GitHub:

```bash
npm install -g git+https://github.com/fyso-dev/awareness-framework.git
```

Verify:

```bash
awareness help
```

If global npm cache permissions are broken on the machine, use a temporary cache:

```bash
npm_config_cache=/tmp/npm-cache-awareness npm install -g git+https://github.com/fyso-dev/awareness-framework.git
```

## Initialize Private State

Initialize the private awareness home:

```bash
awareness init
```

This creates missing files under `~/.agents/`:

```text
~/.agents/
  AGENTS.md
  awareness/current.md
  worklog/YYYY-MM-DD.md
  memory/personality.md
  memory/preferences.md
  memory/patterns.md
  memory/long-term.md
  memory/users/
  evaluations/
  runtime/
```

Existing files are not overwritten.

Initialize a channel-scoped state folder:

```bash
awareness init --channel support
```

This creates missing files under:

```text
~/.agents/channels/support/
```

Record narrow user memory inside the selected channel:

```bash
awareness user note \
  --channel support \
  --user user-123 \
  --kind topic \
  --text "Has been discussing worklog automation" \
  --evidence "Message link or timestamp"
```

## Initialize Agent Wrappers

Create regular wrapper files for supported CLIs:

```bash
awareness init --wrappers
```

This creates missing files:

```text
~/.codex/AGENTS.md
~/.claude/CLAUDE.md
~/.config/opencode/AGENTS.md
~/.pi/agent/AGENTS.md
```

Wrappers point to the canonical private protocol:

```text
~/.agents/AGENTS.md
```

Existing wrappers are not overwritten. To intentionally replace wrappers:

```bash
awareness init --wrappers --overwrite-wrappers
```

## Verify Initialization

Check current state:

```bash
awareness status
awareness check
```

If another agent may have changed state during a session:

```bash
awareness refresh
```

Before handoff:

```bash
awareness handoff
```

## Optional Hook Installation

Wrappers tell agents what to read. Hooks make supported tools run the maintenance commands at lifecycle boundaries.

Install hooks for Codex, Claude Code, and OpenCode:

```bash
awareness hook install --tool all --command "$(command -v awareness)"
```

Generated files:

```text
~/.codex/hooks.json
~/.claude/settings.json
~/.config/opencode/plugins/awareness-framework.js
```

Codex requires configured command hooks to be reviewed and trusted from `/hooks` before they run.

## Optional Global Schedule

On macOS, install hourly and daily user LaunchAgents:

```bash
awareness schedule install --cadence all --command "$(command -v awareness)"
```

Load them immediately:

```bash
awareness schedule install --cadence all --command "$(command -v awareness)" --load
```

Generated files:

```text
~/Library/LaunchAgents/dev.fyso.awareness.hourly.plist
~/Library/LaunchAgents/dev.fyso.awareness.daily.plist
```

Hourly runs record private health events. Daily runs create the evaluation note if missing.

## Custom Paths

Use a custom private awareness home:

```bash
awareness init --home /path/to/.agents
```

Use custom wrapper roots for tests or non-standard machines:

```bash
awareness init --wrappers \
  --home /path/to/.agents \
  --user-home /path/to/user-home \
  --config-home /path/to/config-home
```

Environment variables are also supported:

```bash
AGENTS_HOME=/path/to/.agents awareness status
AWARENESS_USER_HOME=/path/to/user-home awareness init --wrappers
XDG_CONFIG_HOME=/path/to/config-home awareness init --wrappers
```

## Update

Reinstall from GitHub:

```bash
npm install -g git+https://github.com/fyso-dev/awareness-framework.git
```

Then refresh local private files and wrappers:

```bash
awareness init --wrappers
```

Use `--overwrite-wrappers` only when you want the framework to replace existing wrapper files.

Refresh hooks and schedules after upgrading when command paths or hook definitions changed:

```bash
awareness hook install --tool all --command "$(command -v awareness)"
awareness schedule install --cadence all --command "$(command -v awareness)"
```

## Uninstall

Remove the global CLI:

```bash
npm uninstall -g @fyso/awareness-framework
```

This does not delete private state under `~/.agents/`, wrapper files, hooks, or LaunchAgents.

## Development Install

For framework development:

```bash
git clone https://github.com/fyso-dev/awareness-framework.git
cd awareness-framework
npm test
npm link
```

After `npm link`, the `awareness` command points to the local checkout.
