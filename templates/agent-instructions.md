# Agent Awareness and Worklog Protocol

You operate in a multi-task, multi-agent environment. Before doing work, load the private awareness state and maintain the private daily worklog.

## Required Private Files

- Awareness board: `~/.agents/awareness/current.md`
- Daily worklog: `~/.agents/worklog/YYYY-MM-DD.md`
- Durable memory and review candidates: `~/.agents/memory/`
- Optional narrow user memory: `~/.agents/memory/users/<user>.md` or scoped channel equivalent
- Optional evaluation notes: `~/.agents/evaluations/YYYY-MM-DD.md`
- Runtime hook and scheduler events: `~/.agents/runtime/`

## Lifecycle

1. On session start, run `awareness status` or `awareness check` if the CLI is available; otherwise read the awareness board directly.
2. Treat imported `@current.md` content as a bootstrap snapshot, not live synchronization.
3. If another agent may have worked in parallel, run `awareness refresh` or reread `current.md` before acting.
4. If the user's request changes focus, update the awareness board and append a task-switch entry to the worklog.
5. When concrete progress happens, append to the daily worklog.
6. When state changes, update the awareness board.
7. Before handoff, run `awareness handoff` if available; otherwise make the awareness board reflect the exact current state and append a final worklog entry.
8. When evaluation or handoff exposes repeated friction, review memory candidates with `awareness memory candidates` or `awareness memory review`.
9. At end of day, prepare a task-grouped summary for human review, including memory candidates and pattern suggestions.
10. Treat hook and scheduler runtime events as diagnostics only; they do not replace task worklog entries.
11. For multi-user channels, keep context scoped by channel and store only narrow user facts in `memory/users/<user>.md`.

## Rules

- Keep the worklog append-only.
- Do not invent task IDs.
- Record evidence: paths, commands, test results, commits, PRs, deployments, blockers.
- Prefer CLI maintenance commands (`awareness focus`, `awareness log`, `awareness handoff`, `awareness evaluate`, `awareness memory candidates`, `awareness memory review`) when available.
- Let evaluations and schedules record promotion candidates, but promote durable memory only with explicit evidence through `awareness memory promote`.
- Promote repeated candidates as `pattern` only after `awareness memory review` or equivalent evidence shows repetition.
- Promote direct user preferences promptly when they affect future collaboration.
- Use `awareness user note` only for short, evidence-backed participant facts such as nicknames, repeated questions, topics, or explicit preferences.
- Use `awareness hook run` and `awareness schedule run` only for low-noise maintenance; do not let them post externally or silently promote long-term memory.
- Keep private state out of version control.
- Ask before posting worklogs, comments, status changes, or summaries to external systems.
- Propose framework improvements through reviewed changes, not hidden local edits.

- Use `awareness remember` for explicit observations that should enter memory review.
- Use `awareness recall QUERY` before repeating uncertain or previously solved work.
- Use `awareness memory trigger --phase PHASE --text TEXT` or `--action TEXT` when an AI-configured trigger should decide whether memory is relevant; do not substitute hardcoded keyword rules for this decision.
- Use `awareness memory used --text TEXT` or `--key KEY` to credit a curated memory that actually helped; include `--note` when the reason matters.
- Review `awareness memory stats` periodically, and use `--json` when you need to inspect utilization, outcome, or repeated zero-result gaps.
- Use `awareness forget --text TEXT --reason REASON --evidence EVIDENCE` when memory is stale, wrong, or superseded.
- Use `awareness improve` after material work or process friction to run evaluation plus memory review.
