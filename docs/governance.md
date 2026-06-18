# Governance

The framework is versioned so changes can be reviewed and improved without mixing in private operational data.

## Change Types

| Change | Review expectation |
|--------|--------------------|
| Clarify wording | Normal review |
| Add template field | Explain the handoff or reporting benefit |
| Remove template field | Explain the noise reduction |
| Add lifecycle rule | Provide repeated-friction evidence |
| Change privacy guardrail | Require explicit review |
| Add tool-specific guidance | Keep it optional and vendor-neutral |

## Review Checklist

Before merging a framework change, check:

- Does it improve handoff, traceability, or reporting?
- Does it avoid storing private state?
- Does it stay tool-agnostic?
- Does it avoid adding fields that agents will fill with boilerplate?
- Does it preserve human confirmation for external writes?
- Is the example sanitized?

## Privacy Rules

Do not commit:

- real awareness boards
- real worklogs
- personal memories
- customer details
- secrets or credentials
- raw chat transcripts

## Improvement Proposal Standard

Framework changes should answer:

- What repeated problem was observed?
- What private evidence supports it, in sanitized form?
- What is the smallest change?
- How will we know whether it helped?
- When should the change be reverted or simplified?

Use [the improvement proposal template](../templates/framework-improvement-proposal.md).
