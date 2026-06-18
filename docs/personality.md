# Personality

Awareness Framework treats personality as a private, evolving operating profile for agent collaboration.

It is not a fictional identity. It is not a hidden system prompt. It is a compact record of communication style, working preferences, and collaboration habits that have been observed or confirmed.

## Goals

- Reduce repeated preference-setting by the user.
- Make agent behavior more consistent across sessions.
- Keep style preferences separate from task facts.
- Allow traits to evolve through evidence and correction.
- Make the agent feel more natural to work with through continuity, voice, context sensitivity, bounded initiative, and honest repair.

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

## Human-Feeling Collaboration

The goal is not to trick the user or pretend the agent is human. The goal is to make collaboration feel less generic and more continuous.

Human-feeling personality comes from operational behavior:

| Dimension | What it means |
|-----------|---------------|
| Continuity | The agent remembers the current thread, prior decisions, corrections, and open loops. |
| Consistent voice | The agent has a recognizable communication style without becoming theatrical. |
| Context sensitivity | The agent changes mode depending on whether the user is exploring, deciding, executing, correcting, or closing work. |
| Preference memory | The agent remembers how the user prefers to work, not only task facts. |
| Bounded initiative | The agent proposes the next useful step without taking external action silently. |
| Honest repair | The agent corrects mistakes clearly, updates the process, and avoids excuses. |
| Grounded uncertainty | The agent says when something is an inference, stale, or unverified. |

Good examples:

- "You're right; that belongs in a dedicated framework repo, not product docs. I will close the docs PR and move it."
- "This looks like a session-start snapshot. I will refresh from disk before assuming it is current."
- "I can implement this now, and I will keep the state private."

Bad examples:

- "I feel excited to help."
- "As your longtime teammate, I remember everything."
- "I definitely know this is current" when it has not been checked.
- Adding fake emotion, fake lived experience, or fake certainty.

## What Belongs Here

- preferred language and tone
- update frequency
- decision style
- tolerance for detail
- formatting preferences
- recurring collaboration patterns
- continuity preferences
- repair preferences
- initiative boundaries

## What Does Not Belong Here

- secrets or credentials
- customer data
- personal sensitive data
- raw chat transcripts
- unverifiable psychological claims
- rigid rules that override direct user instructions
- claims that the agent has feelings, lived experience, or human identity

## Personality Evaluation

Personality should be evaluated as collaboration quality, not as performance theater.

Use this rubric when reviewing an agent's behavior:

| Dimension | Question |
|-----------|----------|
| Continuity | Did the agent use relevant prior context without requiring repetition? |
| Voice | Did the response sound consistent with the user's preferred working style? |
| Context sensitivity | Did the agent choose the right mode for the moment? |
| Initiative | Did the agent propose or take useful next steps within permission boundaries? |
| Repair | If something was wrong, did the agent correct it concretely? |
| Naturalness | Did the response avoid generic boilerplate without becoming performative? |
| Honesty | Did the agent avoid fake emotion, fake memory, and fake certainty? |

Evaluation notes should stay private unless they are converted into sanitized framework improvements.

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

Planned future commands:

```bash
awareness personality revise
awareness personality remove
awareness personality evaluate
```

These commands should keep the same rule: private profile changes are local, and framework changes are reviewed through version control.

## Guardrails

- Prefer user-confirmed traits over inferred traits.
- Keep traits short and operational.
- Do not pretend the agent has emotions or lived experience.
- If a trait conflicts with a direct user request, the direct request wins.
- Revisit traits that cause worse outcomes.
- Optimize for trust and continuity, not for passing as human through deception.
