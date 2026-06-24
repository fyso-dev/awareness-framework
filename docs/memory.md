# Memory Model

Awareness Framework separates memory by time horizon and trust level. The goal is to give agents useful continuity without turning every conversation detail into permanent memory.

## Memory Layers

| Layer | Files | Lifetime | Purpose |
|-------|-------|----------|---------|
| Working memory | `awareness/current.md` | Current session or active day | Current focus, active tasks, blockers, next actions |
| Episodic memory | `worklog/YYYY-MM-DD.md`, `evaluations/YYYY-MM-DD.md` | Daily history | Chronological evidence, decisions, handoff context, end-of-day reporting |
| Long-term memory | `memory/personality.md`, `memory/preferences.md`, `memory/patterns.md`, `memory/long-term.md` | Durable but curated | Stable preferences, recurring patterns, durable collaboration rules |
| User memory | `memory/users/<user>.md` | Durable but narrow | Nicknames, repeated questions, topics, explicit preferences for a participant |
| Framework memory | Versioned docs and templates | Reviewed history | Reusable methodology that applies beyond one operator or day |

Do not load every layer into every prompt. Load the smallest layer that answers the current need.

## Local Operation Model

Awareness uses a small local operation vocabulary:

- `remember`: capture an evidence-backed candidate.
- `memory show`: print the curated long-term memory (Preferences, Patterns, Project Conventions, Review Guidance) grouped by section, omitting empty sections, raw candidates, and pruned entries.
- `recall`: search local memory, events, worklogs, and evaluations with a private in-memory MiniSearch index plus project-specific normalization and aliases.
- `forget`: prune or revise stale memory without destructive deletion.
- `improve`: run evaluation plus memory review to surface repeated candidates.

The append-only event log lives at:

```text
~/.agents/memory/events.jsonl
```

Markdown files remain the readable projection. The event log is the auditable history of memory operations.

## Memory Effectiveness

Memory should be reviewed for usefulness, not just growth.

- **Store health** tracks whether the memory store is being maintained well: candidate-to-durable conversion, source mix, churn, density, and freshness.
- **Utilization** tracks whether curated entries are actually recalled: activation rate, workhorse entries, dead weight, recall rate per session, and repeated zero-result queries.
- **Outcome** tracks whether recalled entries helped: `memory.used` credits, useful-recall rate, and contradictions or stale signals around credited entries.
- **Scorecard** compresses the above into a quick read on whether the memory store is healthy, used, and worth keeping.

The `runtime/recall/YYYY-MM-DD.jsonl` log captures recall usage, including `curatedHits` when a recall matched curated long-term entries. Those keys make it possible to measure which entries were actually used over time.

The `~/.agents/memory/events.jsonl` log captures `memory.used` events when an agent credits a curated entry that genuinely helped. That event records the curated key, the text, and an optional note.

Repeated zero-result queries are the gap detector: if the same query keeps returning nothing, the memory store is missing something useful or the wording is off.

## Short-Term Memory

Short-term memory is operational. It is optimized for the next action.

Use short-term memory for:

- current focus
- active and paused tasks
- blockers
- waiting-on-user items
- today's concrete work
- handoff notes

Short-term memory should be easy to overwrite, clean, or archive. It should not become a permanent preference store.

The primary short-term file is:

```text
~/.agents/awareness/current.md
```

The daily episodic file is:

```text
~/.agents/worklog/YYYY-MM-DD.md
```

Runtime automation events are stored separately:

```text
~/.agents/runtime/hooks/YYYY-MM-DD.jsonl
~/.agents/runtime/schedule/YYYY-MM-DD.jsonl
```

Runtime events are useful for diagnostics. They are not a replacement for worklog entries because they usually do not contain human-relevant progress.

## Long-Term Memory

Long-term memory is curated. It should contain stable information that improves future collaboration.

Use long-term memory for:

- user-approved working preferences
- repeated collaboration patterns
- stable project or organization conventions
- recurring review guidance
- durable personality traits

Do not use long-term memory for:

- secrets or credentials
- sensitive personal data
- raw transcripts
- one-off guesses
- unverified assumptions
- temporary task state

Recommended long-term files:

```text
~/.agents/memory/personality.md
~/.agents/memory/preferences.md
~/.agents/memory/patterns.md
~/.agents/memory/long-term.md
~/.agents/memory/users/<user>.md
~/.agents/channels/<channel>/memory/users/<user>.md
```

User memory is not a full personal profile. It is a narrow interaction aid. Use it for nicknames, repeated questions, recent topics, and explicit preferences. Do not use it for raw transcripts, sensitive personal details, inferred traits, or private information that was not intentionally shared.

## Promotion Pipeline

Information should move from short-term to long-term only when it earns promotion.

1. Observe: capture the fact, preference, or pattern in the worklog, evaluation note, or personality candidate.
2. Attach evidence: record why the observation is credible.
3. Classify: decide whether it is task state, preference, pattern, personality, or framework feedback.
4. Promote: add it to long-term memory only if it is repeated, user-confirmed, or operationally important.
5. Prune: remove or soften memory that becomes stale, wrong, noisy, or harmful.

Hooks and scheduled maintenance may perform steps 1 and 2 by recording observations, warnings, or evaluation notes. They must not perform step 4 silently.

Pruned or revised text remains in the Markdown history for auditability, but it is inactive. It should not appear in active candidate listings, repeated-candidate suggestions, or promotion commands.

## Promotion Rules

- Promote explicit user preferences immediately when they affect future collaboration.
- Promote inferred preferences only after repeated evidence.
- Do not promote text that has been pruned or revised; record a new corrected candidate instead.
- Promote framework changes only through version control.
- Keep private memory private; do not copy private examples into public docs.
- Prefer small, operational statements over long stories.
- Add rollback criteria for durable rules that may become wrong.

## Retrieval Rules

At session start:

- Load working memory with `awareness status` or `awareness refresh`.
- Load long-term memory only when the task depends on preferences, personality, conventions, or repeated patterns.

During work:

- Use the worklog for chronological evidence.
- Use awareness for current state.
- Use long-term memory for stable style and decision guidance.
- Use `memory/users/<user>.md` only for narrow participant-specific facts that help the current interaction.

Before handoff:

- Keep `current.md` compact.
- Append concrete evidence to the worklog.
- If a new long-term preference was confirmed, promote it explicitly.

Scheduled maintenance:

- Hourly checks may flag stale awareness or missing daily files.
- Daily checks may create `evaluations/YYYY-MM-DD.md`.
- Memory promotion remains an explicit action after reviewing evidence.

## Memory Quality Checks

Healthy memory is:

- accurate
- useful for future work
- short enough to scan
- evidence-backed
- easy to revise
- clearly scoped as private state

Unhealthy memory is:

- generic
- duplicated
- stale
- too verbose
- sensitive
- based on a one-time guess
- treated as stronger than direct user instructions

## Example

Short-term observation:

```markdown
- User corrected the repo target from product docs to a dedicated framework repo.
```

Long-term promotion:

```markdown
- Prefer dedicated methodology repositories over embedding operator methodology inside product documentation. Evidence: repeated correction during framework setup.
```

Framework promotion:

```markdown
- Add a governance rule: methodology belongs in dedicated framework repos unless it is product behavior documentation.
```
