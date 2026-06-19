# Long-Term Memory

- Updated: never
- Scope: Local private state; do not commit

This file stores durable, curated memory that improves future collaboration. Evaluations may add promotion candidates automatically, but durable entries should be promoted only when they are user-confirmed, repeated, or operationally important.

## Preferences

- None yet.

## Patterns

- None yet.

## Project Conventions

- None yet.

## Review Guidance

- None yet.

## Promotion Candidates

- None yet.

## Review Notes

- Use `awareness memory candidates` to inspect raw candidates.
- Use `awareness memory review` to surface repeated candidates that may deserve promotion as `Patterns`.
- Use `awareness memory promote --kind preference|pattern|project|review --text TEXT --evidence EVIDENCE` after review.
- Repeated candidates may share the same text with distinct evidence; do not collapse them before review.

## Event Log

- Append-only audit history: `memory/events.jsonl`
- Markdown sections are readable projections.
- Do not hand-edit event history.

## Pruned Or Revised

- None yet.

## Guardrails

- Do not store secrets, credentials, sensitive personal data, or raw transcripts.
- Do not promote one-off guesses without repeated evidence.
- Direct user instructions override memory.
- Remove or soften stale memory.
- Keep promotion evidence concise and linkable.
