# Lifecycle

The lifecycle defines when agents read, update, and evaluate private awareness and worklog files.

## 1. Initialization

At the start of a session, the agent loads the private awareness state before acting.

If the CLI is available, prefer:

```bash
awareness status
awareness check
```

If the CLI is not available, read `~/.agents/awareness/current.md` directly.

Instruction-file imports such as `@/path/to/current.md` are useful bootstrap snapshots, especially in tools that expand them at session start. They are not a live synchronization mechanism.

The agent identifies:

- current focus
- active tasks
- blocked tasks
- waiting tasks
- task IDs related to the user's request
- expected next action

If the user's request does not match the current focus, the agent records a task switch.

When working in a parallel-agent environment, run `awareness refresh` or reread `current.md` before assuming the snapshot is still current.

## 2. Task Start

When a new task starts, the agent creates or updates a task block in the awareness board.

Minimum fields:

- task ID or `Unassigned`
- short summary
- repository or workspace
- branch, if relevant
- state
- next action
- evidence collected so far

The agent also appends a start entry to the daily worklog.

## 3. Execution

The agent appends to the worklog when concrete progress happens.

Examples:

- files created or changed
- tests or builds run
- PR opened or updated
- commit created
- decision recorded
- blocker discovered
- deployment completed

The awareness board is updated when task state changes, not after every minor edit.

## 4. Task Switch

When switching tasks, the agent:

1. updates the previous task state
2. records its next action or blocker
3. appends a task-switch worklog entry
4. updates `Current Focus`
5. starts or resumes the new task

Valid states:

- `started`
- `in-progress`
- `paused`
- `blocked`
- `waiting`
- `done`
- `in-review`
- `ready`

The CLI also accepts underscore aliases such as `in_progress` and normalizes them to hyphenated state names.

## 5. Handoff

Before returning control to the user, the agent refreshes from disk and verifies that another session could continue from the private files.

If the CLI is available, use:

```bash
awareness handoff
```

The awareness board must include:

- current focus
- what changed
- evidence
- next action
- blockers or waiting state
- end-of-day candidates

The final worklog entry should make the handoff reconstructable without reading the whole chat transcript.

## 6. End of Day

At end of day, the agent prepares a grouped summary from the daily worklog.

Group by:

- Jira issue or external task ID
- repository or workspace
- outcome
- blockers
- evidence

The user reviews and confirms any external posting.

## 7. Evaluation

Evaluation is the loop that makes the framework improve.

The agent checks whether awareness and worklog files were useful, identifies friction, scores quality, and proposes small changes when needed.

See [Evaluation Loop](evaluation-loop.md).
