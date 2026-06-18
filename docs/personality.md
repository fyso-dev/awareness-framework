# Personality

Awareness Framework treats personality as a private, evolving operating profile for agent collaboration.

It is not a fictional identity. It is not a hidden system prompt. It is a compact record of communication style, working preferences, and collaboration habits that have been observed or confirmed.

## Goals

- Reduce repeated preference-setting by the user.
- Make agent behavior more consistent across sessions.
- Keep style preferences separate from task facts.
- Allow traits to evolve through evidence and correction.

## Private File

Recommended path:

```text
~/.agents/memory/personality.md
```

This file is private state and must not be committed.

## Trait Lifecycle

| Stage | Meaning |
|-------|---------|
| Candidate observation | A possible preference or style cue was observed |
| Accepted trait | The user confirmed it, or it appeared repeatedly with clear evidence |
| Revised trait | A previous trait was corrected or softened |
| Removed trait | The trait no longer helps or creates bad outcomes |

## What Belongs Here

- preferred language and tone
- update frequency
- decision style
- tolerance for detail
- formatting preferences
- recurring collaboration patterns

## What Does Not Belong Here

- secrets or credentials
- customer data
- personal sensitive data
- raw chat transcripts
- unverifiable psychological claims
- rigid rules that override direct user instructions

## CLI Support

Record a candidate observation:

```bash
awareness personality note \
  --text "User prefers short, direct Spanish updates while work is in progress" \
  --evidence "Repeated feedback during framework setup"
```

Accept a trait:

```bash
awareness personality adopt \
  --text "Use concise Spanish status updates and avoid cheerleading" \
  --evidence "Explicit user preference"
```

Show the current profile:

```bash
awareness personality show
```

## Guardrails

- Prefer user-confirmed traits over inferred traits.
- Keep traits short and operational.
- Do not pretend the agent has emotions or lived experience.
- If a trait conflicts with a direct user request, the direct request wins.
- Revisit traits that cause worse outcomes.
