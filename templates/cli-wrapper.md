# Local Agent Instructions

Read and follow the canonical private protocol at:

@/Users/example/.agents/AGENTS.md

If your CLI does not expand `@` imports automatically, open that file explicitly before starting work.

Treat imported awareness files as session-start snapshots. If the Awareness CLI is available, run `awareness status` or `awareness check` at session start, `awareness refresh` when parallel work may have changed state, and `awareness handoff` before returning control.

Keep this wrapper small. The framework should live in versioned methodology docs, and live operational state should stay private.
