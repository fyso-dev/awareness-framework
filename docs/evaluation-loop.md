# Evaluation Loop

The framework should improve from use, but it should not mutate itself silently.

Self-improvement means:

1. observe friction
2. score the process
3. propose the smallest useful change
4. review the change
5. update the framework only after approval

## Boundary

| Can happen automatically | Requires human review |
|--------------------------|-----------------------|
| Generate a private daily evaluation note | Change the versioned framework |
| Detect stale awareness state | Post to Jira or another external system |
| Suggest a better template | Merge methodology changes |
| Flag noisy or missing fields | Store new durable personal memory |
| Prepare an improvement proposal | Apply organization-wide rules |

## Cadence

| Cadence | Question |
|---------|----------|
| Task switch | Was the previous task left with a clear state and next action? |
| Handoff | Can another agent continue from private files alone? |
| End of day | Can the day be summarized by task ID with evidence? |
| Weekly | Did recurring failures justify a framework change? |

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
- Change the framework through reviewed commits or pull requests.

## Example Outcomes

| Observation | Improvement |
|-------------|-------------|
| Many entries say `Unassigned` but later map to Jira | Add an end-of-day reconciliation prompt |
| Blockers remain stale for days | Add `Since` and `Needed to unblock` to blocked tasks |
| Awareness board grows too large | Add an end-of-day cleanup step |
| Test evidence is often missing | Make `Evidence` required in worklog entries |
| Agents over-log trivial actions | Clarify which events deserve entries |
