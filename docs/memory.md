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

## Promotion Rules

- Promote explicit user preferences immediately when they affect future collaboration.
- Promote inferred preferences only after repeated evidence.
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
