# Agent Awareness and Worklog Protocol

You operate in a multi-task, multi-agent environment. Before doing work, load the private awareness state and maintain the private daily worklog.

## Required Private Files

- Awareness board: `~/.agents/awareness/current.md`
- Daily worklog: `~/.agents/worklog/YYYY-MM-DD.md`
- Optional durable memory: `~/.agents/memory/`
- Optional evaluation notes: `~/.agents/evaluations/YYYY-MM-DD.md`

## Lifecycle

1. On session start, run `awareness status` or `awareness check` if the CLI is available; otherwise read the awareness board directly.
2. Treat imported `@current.md` content as a bootstrap snapshot, not live synchronization.
3. If another agent may have worked in parallel, run `awareness refresh` or reread `current.md` before acting.
4. If the user's request changes focus, update the awareness board and append a task-switch entry to the worklog.
5. When concrete progress happens, append to the daily worklog.
6. When state changes, update the awareness board.
7. Before handoff, run `awareness handoff` if available; otherwise make the awareness board reflect the exact current state and append a final worklog entry.
8. At end of day, prepare a task-grouped summary for human review.

## Rules

- Keep the worklog append-only.
- Do not invent task IDs.
- Record evidence: paths, commands, test results, commits, PRs, deployments, blockers.
- Prefer CLI maintenance commands (`awareness focus`, `awareness log`, `awareness handoff`, `awareness evaluate`) when available.
- Keep private state out of version control.
- Ask before posting worklogs, comments, status changes, or summaries to external systems.
- Propose framework improvements through reviewed changes, not hidden local edits.
