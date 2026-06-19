# Evaluation Loop

The framework should improve from use, but it should not mutate itself silently.

Self-improvement means:

1. observe friction
2. score the process
3. propose the smallest useful change
4. review the change
5. update the framework only after approval

This loop evaluates both execution quality and memory quality. A good evaluation decides whether the next action is a local habit change, a short-term awareness cleanup, a long-term memory update, a template adjustment, or a framework PR.

## Boundary

| Can happen automatically | Requires human review |
|--------------------------|-----------------------|
| Generate a private daily evaluation note | Change the versioned framework |
| Detect stale awareness state | Post to Jira or another external system |
| Suggest a better template | Merge methodology changes |
| Flag noisy or missing fields | Store new durable personal memory |
| Prepare an improvement proposal | Apply organization-wide rules |
| Record hook and scheduler runtime events | Treat runtime events as work evidence |

## Cadence

| Cadence | Question |
|---------|----------|
| Session hook | Did the agent reach a lifecycle boundary that should be recorded? |
| Hourly schedule | Is private state healthy enough for parallel work to continue? |
| Task switch | Was the previous task left with a clear state and next action? |
| Handoff | Can another agent continue from private files alone? |
| Daily schedule | Should a private evaluation note be created for review? |
| End of day | Can the day be summarized by task ID with evidence? |
| Weekly | Did recurring failures justify a framework change? |

## Self-Evaluation Dimensions

Evaluate the agent as a collaborator, not only the files.

| Dimension | Question |
|-----------|----------|
| Task execution | Did the agent make correct, useful progress toward the user's goal? |
| Awareness hygiene | Is `current.md` compact, fresh, and useful for the next agent? |
| Worklog quality | Can the day be reconstructed with task IDs and evidence? |
| Memory quality | Did anything deserve promotion to long-term memory or pruning from it? |
| Personality fit | Did the agent preserve continuity, voice, context sensitivity, and honest repair? |
| Tool reliability | Did CLI commands and checks reduce context burden or add friction? |
| Framework feedback | Did repeated friction suggest a versioned methodology change? |

## Signals

Track signals from private awareness and worklog files:

- stale `Current Focus`
- active tasks without `Next`
- worklog entries without task IDs
- worklog entries without evidence
- repeated blockers without owner or checkpoint
- external task IDs discovered late
- chat-only decisions not reflected in the worklog
- awareness board too verbose to scan
- end-of-day summary requiring manual reconstruction

## Scoring Rubric

Use a small 0-2 rubric.

| Dimension | 0 | 1 | 2 |
|-----------|---|---|---|
| Freshness | Awareness is stale or misleading | Mostly current with minor gaps | Current focus and task states are accurate |
| Traceability | Work cannot be tied to IDs or evidence | Some work is traceable | Meaningful work has task ID and evidence |
| Handoff quality | Chat history is required | Next actions exist but lack context | Another agent can continue from files alone |
| Noise control | Files are too verbose or obsolete | Some cleanup needed | Current board is compact and useful |
| Reporting readiness | Summary needs reconstruction | Summary exists with manual fixes | Summary is ready for human review |

Scores are diagnostic. A low score should produce a targeted improvement proposal, not blame.

## Improvement Rules

- Add a rule only when a repeated failure cannot be solved by a local habit.
- Add a field only when it improves handoff or end-of-day reporting.
- Remove fields that agents fill with low-value boilerplate.
- Convert repeated user corrections into template improvements.
- Keep the awareness board optimized for next action.
- Keep the worklog optimized for evidence.
- Promote short-term observations to long-term memory only when user-confirmed, repeated, or operationally important.
- Prune memory that becomes stale, noisy, sensitive, or contradicted by direct user instructions.
- Change the framework through reviewed commits or pull requests.

## Improvement Routing

| Finding | Route |
|---------|-------|
| Current focus stale | Update `awareness/current.md` |
| Missing evidence | Append or correct the daily worklog |
| Repeated preference | Promote to `memory/preferences.md` or `memory/long-term.md` |
| Collaboration style correction | Update `memory/personality.md` |
| Repeated workflow friction | Propose a template or docs PR |
| Sensitive or stale memory | Prune private memory |
| Tool command confusion | Improve CLI docs or command behavior |
| Repeated scheduler warning | Improve local habits, templates, or CLI checks |

## Evaluation Output

Each evaluation should end with one of these outcomes:

- No change.
- Clean up awareness.
- Append missing evidence.
- Promote memory.
- Prune memory.
- Adjust local habit.
- Propose framework PR.
- Ask user for confirmation.

Daily evaluation is active by default: when it writes an evaluation note, the CLI also records promotion candidates under `memory/long-term.md`. Auto-generated candidates are deduplicated by text across days so repeated diagnostics do not crowd out human-curated observations. Candidates are intentionally reviewable. Use `awareness memory review` to surface repeated candidates as suggested `pattern` promotions, then promote them with `awareness memory promote` only after they are user-confirmed, repeated, operationally important, and not pruned or revised.

## Example Outcomes

| Observation | Improvement |
|-------------|-------------|
| Many entries say `Unassigned` but later map to Jira | Add an end-of-day reconciliation prompt |
| Blockers remain stale for days | Add `Since` and `Needed to unblock` to blocked tasks |
| Awareness board grows too large | Add an end-of-day cleanup step |
| Test evidence is often missing | Make `Evidence` required in worklog entries |
| Agents over-log trivial actions | Clarify which events deserve entries |
| User repeats the same preference | Promote it to long-term memory |
| Personality feels generic | Add or revise private personality traits |
