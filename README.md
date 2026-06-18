# Awareness Framework

Awareness Framework is a working methodology for humans who use multiple AI agents across parallel tasks. It gives agents a shared operational protocol for current focus, task handoff, daily worklogs, and process evaluation without depending on hidden model memory.

This repository contains the framework, templates, and governance rules. It must not contain real awareness boards, daily worklogs, personal memories, customer details, or private task state.

## What This Is

- A methodology for agent-assisted work.
- A shared vocabulary for awareness, worklog, handoff, and evaluation.
- A set of templates that can be copied into private local state.
- An optional helper CLI that maintains and checks private state.
- A reviewable process for improving the methodology over time.

## What This Is Not

- Not a task manager.
- Not dependent on a CLI tool.
- Not a Jira replacement.
- Not a vector memory product.
- Not a place to store private operational state.

## Core Artifacts

| Artifact | Versioned here? | Purpose |
|----------|-----------------|---------|
| Framework docs | Yes | Canonical methodology and rules |
| Templates | Yes | Sanitized starting points |
| Awareness board | No | Mutable private current state |
| Daily worklog | No | Append-only private record of the day |
| Personal memory | No | Durable private preferences and patterns |
| Evaluation notes | No by default | Private observations used to propose framework improvements |

Personality is treated as a private operating profile: continuity, voice, context sensitivity, bounded initiative, and honest repair. It must not become fake emotion, fake identity, or hidden autonomy.

## Recommended Private Layout

```text
~/.agents/
  AGENTS.md
  awareness/
    current.md
  worklog/
    YYYY-MM-DD.md
  memory/
    preferences.md
    patterns.md
    long-term.md
  evaluations/
    YYYY-MM-DD.md
  runtime/
    hooks/
    schedule/
```

## Method

1. At session start, the agent loads private awareness state. If the CLI is available, it runs `awareness status` or `awareness check`; otherwise it reads the private awareness board.
2. When focus changes, the agent updates awareness and appends a task-switch worklog entry.
3. When concrete progress happens, the agent appends a worklog entry with evidence.
4. Before handoff, or when parallel work may have changed state, the agent refreshes from disk and leaves a clear current state and next action.
5. At end of day, the agent prepares a task-grouped summary for human review.
6. During evaluation, the agent identifies process friction and proposes framework changes through PRs.

## Documentation

- [Install](docs/install.md)
- [Framework](docs/framework.md)
- [Lifecycle](docs/lifecycle.md)
- [Private State](docs/private-state.md)
- [Evaluation Loop](docs/evaluation-loop.md)
- [Memory Model](docs/memory.md)
- [Hooks and Scheduling](docs/hooks-and-scheduling.md)
- [CLI](docs/cli.md)
- [Personality](docs/personality.md)
- [Adoption Guide](docs/adoption.md)
- [Governance](docs/governance.md)

## Templates

- [Agent instructions](templates/agent-instructions.md)
- [CLI wrapper](templates/cli-wrapper.md)
- [Awareness board](templates/awareness-current.md)
- [Daily worklog](templates/daily-worklog.md)
- [End-of-day summary](templates/end-of-day-summary.md)
- [Evaluation note](templates/evaluation-note.md)
- [Framework improvement proposal](templates/framework-improvement-proposal.md)
- [Personality profile](templates/personality.md)

## CLI Quick Start

```bash
npm install -g git+https://github.com/fyso-dev/awareness-framework.git
awareness init
awareness init --wrappers
awareness status
awareness refresh
awareness check
awareness hook install --tool all --command "$(command -v awareness)"
awareness schedule install --cadence all --command "$(command -v awareness)"
```

The CLI only reads and writes private local files. It does not post to Jira, GitHub, or any external system.
