# Multi-User Scoping

Multi-user integrations often need two different kinds of continuity:

- Channel context: what is happening in this conversation space, what the current focus is, and what work is in progress.
- User memory: small facts about a specific participant, such as nicknames, repeated questions, topics, and explicit preferences.

Do not create a full awareness workspace for every user by default. Keep operational context scoped to the channel, and store only narrow user memory records inside that channel.

## Layout

Default private state remains:

```text
~/.agents/
```

Channel-scoped context lives under:

```text
~/.agents/channels/<channel>/
  awareness/current.md
  worklog/YYYY-MM-DD.md
  evaluations/YYYY-MM-DD.md
  runtime/
  memory/users/<user>.md
```

Global user memory, when a channel is not relevant, lives under:

```text
~/.agents/memory/users/<user>.md
```

Use stable platform IDs for `<channel>` and `<user>` whenever possible. Display names and channel names can change.

## Channel Context Commands

Use `--channel` to choose the channel context:

```bash
awareness status --channel "$CHANNEL_ID"
awareness focus --channel "$CHANNEL_ID" \
  --task PROJECT-123 \
  --summary "Handle support questions" \
  --repo fyso-dev/support-bot \
  --branch main \
  --next "Answer the latest pending question"
```

This keeps awareness, worklog, evaluations, and runtime records isolated to that channel.

## User Memory Commands

Use `awareness user note` to store a small fact about a user:

```bash
awareness user note \
  --channel "$CHANNEL_ID" \
  --user "$USER_ID" \
  --kind nickname \
  --text "Ace" \
  --evidence "User introduced themselves this way"
```

Supported kinds:

- `nickname`
- `question`
- `topic`
- `preference`
- `fact`
- `note`

Examples:

```bash
awareness user note \
  --channel "$CHANNEL_ID" \
  --user "$USER_ID" \
  --kind question \
  --text "Asked how to connect the bot to the work tracker" \
  --evidence "Message link or timestamp"

awareness user note \
  --channel "$CHANNEL_ID" \
  --user "$USER_ID" \
  --kind topic \
  --text "Has been discussing worklog automation and agent memory" \
  --evidence "Repeated questions in the channel"
```

Show a user's memory in the active channel:

```bash
awareness user show --channel "$CHANNEL_ID" --user "$USER_ID"
```

## Customization Ideas

Useful user memory fields:

- Nicknames and preferred forms of address.
- Repeated questions they asked.
- Topics they have been discussing recently.
- Explicit preferences for language, detail, formatting, or cadence.
- Role or project context when the user states it directly.
- Boundaries such as "do not send direct messages" or "prefer public thread replies".

Keep each entry short and evidence-backed. Prefer:

```markdown
- 2026-06-18 11:40: Asked how to separate channel context from per-user memory (evidence: message link)
```

Avoid:

- raw transcripts
- secrets
- sensitive personal details
- inferred personality judgments
- unverified private information
- permanent memory for one-off comments

## Retention Rules

For multi-user systems, add explicit retention behavior around user memory:

- Store stable user IDs, not mutable display names, as filenames.
- Keep recent questions bounded by count or age.
- Allow deleting a single user file.
- Allow exporting a single user file for review.
- Promote user preferences only when explicit or repeated.
- Do not copy user memory into framework docs or public issues.

## Recommended Bot Flow

For each incoming message:

1. Resolve `channel_id` and `user_id`.
2. Run channel context operations with `--channel "$channel_id"`.
3. Read user memory only when it helps the reply.
4. Append user memory only for useful, evidence-backed facts.
5. Keep task worklog entries in the channel context, not in the user memory file.

This gives the integration continuity without turning every user into a separate task workspace.
