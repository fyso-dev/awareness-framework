# Framework

Awareness Framework separates methodology from operational state.

The framework lives in version control. Real state lives privately on the operator's machine or in an approved private system.

## Design Goals

1. Make agent work reconstructable at the end of the day.
2. Support multiple parallel tasks without relying on chat history.
3. Make handoffs between agent sessions explicit.
4. Preserve evidence for external worklogs and status reports.
5. Improve the methodology through reviewable changes.

## Non-Goals

1. Do not replace Jira, GitHub Issues, sprint boards, or project task managers.
2. Do not store secrets, credentials, customer data, or private memories.
3. Do not require a specific AI agent, CLI, model, or vendor.
4. Do not make autonomous external updates without human confirmation.
5. Do not optimize for exhaustive history in the live awareness board.

## Operating Principles

### 1. Current State Is Mutable

The awareness board is a compact snapshot of the current operating state. It can be edited as work changes.

It should answer:

- What is the current focus?
- What tasks are active, paused, blocked, or waiting?
- What is the next action for each active task?
- What evidence exists?
- What should appear in the end-of-day report?

### 2. Bootstrap Is Not Synchronization

Instruction-file imports can preload the awareness board at session start. That is a snapshot, not a live subscription to file changes.

In parallel-agent workflows, agents should refresh from disk before acting on potentially stale state. If the CLI is available, use `awareness refresh`, `awareness check`, or `awareness handoff`. If not, reread `~/.agents/awareness/current.md`.

### 3. History Is Append-Only

The daily worklog is chronological and append-only. Corrections are new entries.

It should capture:

- task starts and switches
- concrete progress
- meaningful decisions
- blockers
- verification
- commits, PRs, deployments, and external evidence

### 4. Evidence Beats Narration

Prefer concrete evidence over long prose:

- file paths
- commands
- test results
- commit hashes
- PR links
- issue IDs
- blocker owners

### 5. External IDs Are Preserved, Not Invented

When a Jira issue, GitHub issue, PR, or ticket exists, record it. If none exists, use `Unassigned` and reconcile later.

Agents must not invent external IDs.

### 6. Private State Is Not Versioned

This repository stores templates and rules only. Real files such as `~/.agents/awareness/current.md` and `~/.agents/worklog/YYYY-MM-DD.md` stay private.

### 7. Self-Improvement Is Reviewed

Agents can detect process friction and suggest improvements, but framework changes happen through pull requests or another reviewed change process.

## Parallel Task Model

Only one task is the current focus, but many tasks can be active, paused, blocked, or waiting.

| Section | Role |
|---------|------|
| Current Focus | The one task the current session is actively serving |
| Active Tasks | Work that can continue |
| Blocked Tasks | Work that cannot continue and why |
| Waiting On User | Decisions, credentials, approvals, or clarifications |
| Parking Lot | Relevant deferred ideas |
| End-of-Day Candidates | Work likely to become an external summary or worklog |

The most important field for parallel work is `Next`. If `Next` is unclear, the task is not ready for handoff.
