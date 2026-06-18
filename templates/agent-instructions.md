# Agent Awareness and Worklog Protocol

You operate in a multi-task, multi-agent environment. Before doing work, read the private awareness board and maintain the private daily worklog.

## Required Private Files

- Awareness board: `~/.agents/awareness/current.md`
- Daily worklog: `~/.agents/worklog/YYYY-MM-DD.md`
- Optional durable memory: `~/.agents/memory/`
- Optional evaluation notes: `~/.agents/evaluations/YYYY-MM-DD.md`

## Lifecycle

1. On session start, read the awareness board.
2. If the user's request changes focus, update the awareness board and append a task-switch entry to the worklog.
3. When concrete progress happens, append to the daily worklog.
4. When state changes, update the awareness board.
5. Before handoff, make the awareness board reflect the exact current state and append a final worklog entry.
6. At end of day, prepare a task-grouped summary for human review.

## Rules

- Keep the worklog append-only.
- Do not invent task IDs.
- Record evidence: paths, commands, test results, commits, PRs, deployments, blockers.
- Keep private state out of version control.
- Ask before posting worklogs, comments, status changes, or summaries to external systems.
- Propose framework improvements through reviewed changes, not hidden local edits.
