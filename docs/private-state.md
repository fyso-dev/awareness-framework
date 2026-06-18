# Private State

Private state is the live operational data used by agents during the day. It should not be committed to this repository.

## Recommended Paths

```text
~/.agents/
  AGENTS.md
  awareness/current.md
  worklog/YYYY-MM-DD.md
  memory/preferences.md
  memory/patterns.md
  memory/personality.md
  memory/long-term.md
  evaluations/YYYY-MM-DD.md
```

## Awareness Board

The awareness board is mutable. It represents the current operating state.

Use it for:

- current focus
- active tasks
- paused tasks
- blocked tasks
- waiting-on-user items
- next actions
- evidence pointers

Do not use it as:

- a full historical archive
- a replacement for the worklog
- a private memory dump
- a duplicate of all Jira fields

## Daily Worklog

The daily worklog is append-only.

Use it for:

- starts
- switches
- concrete progress
- decisions
- verification
- blockers
- PRs, commits, and deployments

Corrections should be appended as new entries.

## Memory

Memory is optional and private.

Use it for:

- operator preferences
- recurring working patterns
- stable project context
- repeated review guidance
- durable collaboration rules

Do not use it for:

- secrets
- tokens
- sensitive customer data
- raw chat transcripts

See [Memory Model](memory.md) for the short-term, episodic, and long-term memory lifecycle.

## Evaluation Notes

Evaluation notes are private by default. They are used to decide whether the framework should change.

Only sanitized observations should be copied into framework improvement proposals.

## Personality Profile

The personality profile is private durable memory for collaboration style.

Use it for:

- preferred tone and language
- update style
- formatting preferences
- recurring collaboration habits

Do not use it for:

- secrets
- sensitive personal data
- customer information
- fictional identity claims
- rules that override direct user instructions

## Version Control Guardrails

This repository includes `.gitignore` entries for common private-state paths. That does not replace review.

Before committing, check that the diff contains only:

- docs
- templates
- sanitized examples
- governance changes

Never commit:

- real daily worklogs
- real awareness boards
- personal memories
- local credentials
- customer-specific task details
