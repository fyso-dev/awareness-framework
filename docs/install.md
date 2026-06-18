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
  evaluations/
```

Existing files are not overwritten.

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

## Uninstall

Remove the global CLI:

```bash
npm uninstall -g @fyso/awareness-framework
```

This does not delete private state under `~/.agents/` or wrapper files.

## Development Install

For framework development:

```bash
git clone https://github.com/fyso-dev/awareness-framework.git
cd awareness-framework
npm test
npm link
```

After `npm link`, the `awareness` command points to the local checkout.
