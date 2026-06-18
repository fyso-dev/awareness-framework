# Adoption Guide

This framework can be adopted by any AI coding agent or assistant that can read and write local files.

## Local Setup

Create private files outside this repository:

```text
~/.agents/
  AGENTS.md
  awareness/current.md
  worklog/YYYY-MM-DD.md
```

Copy the templates from `templates/` into private state and adapt paths for the operator.

Alternatively, use the helper CLI:

```bash
npm install -g git+https://github.com/fyso-dev/awareness-framework.git
awareness init
```

## Agent Instruction Pattern

Use one canonical private instruction file:

```text
~/.agents/AGENTS.md
```

Then use small per-agent wrappers that point to it.

This keeps the methodology consistent across agents while allowing each CLI to use its own instruction-file location.

## Wrapper Pattern

Some agents support direct imports from instruction files. Others require explicit text telling the agent to read the canonical file.

Use a regular file for each wrapper. Avoid relying on symlinks unless the target CLI is known to resolve them correctly in the operator's environment.

Direct imports and `@path` expansion should be treated as session-start snapshots. They are useful for bootstrap context, but they do not guarantee that the agent sees changes made by another agent later in the session.

If the CLI is available, wrappers should instruct agents to use:

- `awareness status` or `awareness check` at session start
- `awareness refresh` before acting on possibly stale state
- `awareness handoff` before returning control

Example wrapper:

```markdown
# Local Agent Instructions

Read and follow the canonical private protocol at:

@/Users/example/.agents/AGENTS.md

If your CLI does not expand `@` imports automatically, open that file explicitly before starting work.

If the Awareness CLI is available, run `awareness status` or `awareness check` at session start, `awareness refresh` before acting on possibly stale state, and `awareness handoff` before returning control.
```

## External Systems

The framework complements external systems.

| System | Role |
|--------|------|
| Jira | Planning, accountability, final worklog target |
| GitHub Issues | Code-related tasks and discussion |
| Pull requests | Reviewable code and documentation changes |
| Task managers | Optional project decomposition |
| Awareness board | Local current operating state |
| Daily worklog | Local chronological evidence |

Do not duplicate every external field. Store only what helps the next agent session and the end-of-day report.

## End-of-Day Flow

1. Read the daily worklog.
2. Group entries by task ID.
3. Attach evidence.
4. Identify blockers.
5. Prepare suggested external worklog text.
6. Ask for human confirmation before posting.

## Migration From Ad Hoc Notes

Start small:

1. Use only `Current Focus`, `Active Tasks`, and the daily worklog.
2. Add `Blocked Tasks` when parallel work increases.
3. Add evaluation notes after the process has been used for at least one day.
4. Promote only repeated improvements into this repository.
