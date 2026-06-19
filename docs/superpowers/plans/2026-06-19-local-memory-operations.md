# Local Memory Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a small Cognee-inspired local memory operation model to Awareness: `remember`, `recall`, `forget`, and `improve`.

**Architecture:** Keep Markdown files as human-readable projections and add an append-only local event log at `memory/events.jsonl` for auditability. Implement deterministic text recall across memory, worklog, evaluations, and memory events before considering embeddings, graph storage, or additional services.

**Tech Stack:** Node.js ESM, built-in `fs`, `path`, `os`, current CLI parser in `src/cli.js`, Node test runner in `test/cli.test.js`, Markdown docs/templates.

## Global Constraints

- No graph database.
- No embeddings or vector store.
- No external services.
- No new runtime dependencies.
- Keep private operational state under `~/.agents`.
- Keep Markdown as the readable projection.
- Durable memory promotion remains explicit and evidence-backed.
- Forget means prune/revise, not destructive deletion.

---

## File Structure

- Modify `src/cli.js`: add top-level command routing, event-log helpers, `remember`, `recall`, `forget`, and `improve` command implementations.
- Modify `test/cli.test.js`: add focused CLI tests for events, remember, recall, forget, and improve.
- Modify `docs/cli.md`: document the new commands and event-log behavior.
- Modify `docs/memory.md`: explain event log plus Markdown projection model.
- Modify `README.md`: update quick start and private layout to mention `memory/events.jsonl` and memory operations.
- Modify `templates/agent-instructions.md`: instruct agents when to use remember, recall, forget, and improve.
- Modify `templates/memory-long-term.md`: describe event-backed projection and prune/revision behavior.

---

### Task 1: Add Top-Level Memory Operation Routing

**Files:**
- Modify: `src/cli.js`
- Test: `test/cli.test.js`

**Interfaces:**
- Consumes: existing `runCli(argv, options)`, `parseArgs(argv)`, `printHelp(ctx)`.
- Produces: top-level commands `remember`, `recall`, `forget`, and `improve`; positional tail support for `recall QUERY`.

- [ ] **Step 1: Write failing test for help output**

Add this test near the other CLI command tests in `test/cli.test.js`:

```js
test('help lists local memory operation commands', () => {
  let stdout = '';
  const code = runCli(['help'], {
    env: {
      ...process.env,
      AWARENESS_NOW: '2099-01-02T12:34:00.000Z',
    },
    stdout: { write: (chunk) => { stdout += chunk; } },
    stderr: { write: () => {} },
  });

  assert.equal(code, 0);
  assert.match(stdout, /awareness remember --text TEXT --evidence TEXT/);
  assert.match(stdout, /awareness recall QUERY/);
  assert.match(stdout, /awareness forget --text TEXT --reason TEXT --evidence TEXT/);
  assert.match(stdout, /awareness improve/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern "help lists local memory operation commands"`

Expected: FAIL because help output does not include these commands.

- [ ] **Step 3: Update positional parsing and command routing**

In `src/cli.js`, change the positional destructuring in `runCli` from:

```js
const [command, subcommand] = parsed.positionals;
```

to:

```js
const [command, subcommand, ...positionRest] = parsed.positionals;
```

Add these cases to the command switch after the existing `memory` case:

```js
      case 'remember':
        return rememberCommand(ctx, parsed.opts);
      case 'recall':
        return recallCommand(ctx, [subcommand, ...positionRest].filter(Boolean).join(' '), parsed.opts);
      case 'forget':
        return forgetCommand(ctx, parsed.opts);
      case 'improve':
        return improveCommand(ctx, parsed.opts);
```

Add these help lines after the `awareness memory promote ...` line in `printHelp(ctx)`:

```text
  awareness remember --text TEXT --evidence TEXT [--home PATH]
  awareness recall QUERY [--limit N] [--home PATH]
  awareness forget --text TEXT --reason TEXT --evidence TEXT [--home PATH]
  awareness improve [--force] [--min-count N] [--home PATH]
```

Add temporary command stubs below `memoryPromotionSection(kind)` so routing can compile:

```js
function rememberCommand(ctx, opts) {
  throw new Error('remember command is not implemented yet');
}

function recallCommand(ctx, query, opts) {
  throw new Error('recall command is not implemented yet');
}

function forgetCommand(ctx, opts) {
  throw new Error('forget command is not implemented yet');
}

function improveCommand(ctx, opts) {
  throw new Error('improve command is not implemented yet');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --test-name-pattern "help lists local memory operation commands"`

Expected: PASS.

- [ ] **Step 5: Run full tests**

Run: `npm test`

Expected: PASS for the existing suite plus the new help test.

- [ ] **Step 6: Commit**

```bash
git add src/cli.js test/cli.test.js
git commit -m "Add memory operation command routing"
```

---

### Task 2: Add Append-Only Memory Event Log Helpers

**Files:**
- Modify: `src/cli.js`
- Test: `test/cli.test.js`

**Interfaces:**
- Consumes: `todayParts(ctx)`, `formatTimestamp(today)`, `ensureDir(dir)`.
- Produces: `memoryEventPath(home)`, `appendMemoryEvent(home, today, event)`, `readMemoryEvents(home)`.

- [ ] **Step 1: Write failing tests for event log writes from existing memory commands**

Add this test after `memory note and promote update long-term memory`:

```js
test('memory note and promote append auditable memory events', () => {
  const home = tempHome();
  run(['init'], home);

  run([
    'memory',
    'note',
    '--text', 'User wants local recall',
    '--evidence', 'Planning discussion',
  ], home);
  run([
    'memory',
    'promote',
    '--kind', 'preference',
    '--text', 'Prefer local-first memory operations',
    '--evidence', 'User approved local event log design',
  ], home);

  const events = fs.readFileSync(path.join(home, 'memory', 'events.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));

  assert.equal(events[0].type, 'memory.candidate.created');
  assert.equal(events[0].text, 'User wants local recall');
  assert.equal(events[0].source, 'memory.note');
  assert.equal(events[1].type, 'memory.promoted');
  assert.equal(events[1].kind, 'preference');
  assert.equal(events[1].text, 'Prefer local-first memory operations');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern "memory note and promote append auditable memory events"`

Expected: FAIL because `memory/events.jsonl` does not exist.

- [ ] **Step 3: Add event log helpers**

Add these helper functions near `longTermMemoryPath(home)`:

```js
function memoryEventPath(home) {
  return path.join(home, 'memory', 'events.jsonl');
}

function appendMemoryEvent(home, today, event) {
  const file = memoryEventPath(home);
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, `${JSON.stringify({
    timestamp: formatTimestamp(today),
    ...event,
  })}\n`);
  return file;
}

function readMemoryEvents(home) {
  const file = memoryEventPath(home);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
```

- [ ] **Step 4: Update candidate and promotion writers to append events**

Change `appendMemoryCandidate` signature from:

```js
function appendMemoryCandidate(home, today, text, evidence) {
```

to:

```js
function appendMemoryCandidate(home, today, text, evidence, source = 'memory.note') {
```

After `fs.writeFileSync(file, content);`, add:

```js
  appendMemoryEvent(home, today, {
    type: 'memory.candidate.created',
    source,
    text,
    evidence,
  });
```

In `recordEvaluationMemoryCandidates(home, today)`, change:

```js
return candidates.filter((candidate) => appendMemoryCandidate(home, today, candidate.text, candidate.evidence));
```

to:

```js
return candidates.filter((candidate) => appendMemoryCandidate(home, today, candidate.text, candidate.evidence, 'evaluation'));
```

In `memoryPromoteCommand`, after `fs.writeFileSync(file, content);`, add:

```js
  appendMemoryEvent(home, today, {
    type: 'memory.promoted',
    kind,
    section,
    text,
    evidence,
  });
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- --test-name-pattern "memory note and promote append auditable memory events"`

Expected: PASS.

- [ ] **Step 6: Run full tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/cli.js test/cli.test.js
git commit -m "Record auditable memory events"
```

---

### Task 3: Implement `awareness remember`

**Files:**
- Modify: `src/cli.js`
- Test: `test/cli.test.js`

**Interfaces:**
- Consumes: `appendMemoryCandidate(home, today, text, evidence, source)`, `agentsHome(ctx, opts)`, `ensurePrivateState(home, ctx)`.
- Produces: top-level `awareness remember --text TEXT --evidence TEXT`.

- [ ] **Step 1: Write failing test**

Add this test after the event-log test:

```js
test('remember records a promotion candidate and event', () => {
  const home = tempHome();
  run(['init'], home);

  const result = run([
    'remember',
    '--text', 'Prefer recall before repeating implementation work',
    '--evidence', 'User asked for active memory operations',
  ], home);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Remembered candidate/);

  const memory = fs.readFileSync(path.join(home, 'memory', 'long-term.md'), 'utf8');
  assert.match(memory, /Prefer recall before repeating implementation work/);

  const [event] = fs.readFileSync(path.join(home, 'memory', 'events.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.equal(event.type, 'memory.candidate.created');
  assert.equal(event.source, 'remember');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern "remember records a promotion candidate and event"`

Expected: FAIL with `remember command is not implemented yet`.

- [ ] **Step 3: Implement remember command**

Replace the `rememberCommand` stub with:

```js
function rememberCommand(ctx, opts) {
  const home = agentsHome(ctx, opts);
  ensurePrivateState(home, ctx);
  const text = required(opts, 'text');
  const evidence = required(opts, 'evidence');
  const today = todayParts(ctx);
  const added = appendMemoryCandidate(home, today, text, evidence, 'remember');
  out(ctx, added ? `Remembered candidate: ${text}` : `Memory candidate already exists: ${text}`);
  return 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --test-name-pattern "remember records a promotion candidate and event"`

Expected: PASS.

- [ ] **Step 5: Run full tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/cli.js test/cli.test.js
git commit -m "Add remember command"
```

---

### Task 4: Implement Deterministic `awareness recall`

**Files:**
- Modify: `src/cli.js`
- Test: `test/cli.test.js`

**Interfaces:**
- Consumes: `longTermMemoryPath(home)`, `memoryEventPath(home)`, `path.join(home, 'worklog')`, `path.join(home, 'evaluations')`.
- Produces: `awareness recall QUERY [--limit N]` with deterministic text matching.

- [ ] **Step 1: Write failing recall test**

Add this test after the remember test:

```js
test('recall searches memory, events, worklogs, and evaluations', () => {
  const home = tempHome();
  run(['init'], home);
  run([
    'remember',
    '--text', 'Always run recall before implementing memory features',
    '--evidence', 'Memory operations plan',
  ], home);
  run([
    'log',
    '--task', 'PROJECT-123',
    '--summary', 'Validated recall behavior',
    '--changes', 'Recall should search worklog text.',
    '--evidence', 'test/cli.test.js',
  ], home);

  const result = run(['recall', 'recall behavior'], home);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Recall Results/);
  assert.match(result.stdout, /memory\/long-term\.md/);
  assert.match(result.stdout, /worklog\/2099-01-02\.md/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern "recall searches memory"`

Expected: FAIL with `recall command is not implemented yet`.

- [ ] **Step 3: Add recall helpers**

Add these helpers near `readMemoryEvents(home)`:

```js
function collectRecallSources(home) {
  return [
    longTermMemoryPath(home),
    memoryEventPath(home),
    ...markdownFiles(path.join(home, 'worklog')),
    ...markdownFiles(path.join(home, 'evaluations')),
  ].filter((file) => fs.existsSync(file));
}

function markdownFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((name) => path.join(dir, name));
}

function recallMatches(home, query, limit) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const results = [];
  for (const file of collectRecallSources(home)) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, index) => {
      const haystack = line.toLowerCase();
      const score = terms.filter((term) => haystack.includes(term)).length;
      if (score > 0) {
        results.push({
          file,
          line: index + 1,
          score,
          text: line.trim(),
        });
      }
    });
  }
  return results
    .sort((left, right) => right.score - left.score || left.file.localeCompare(right.file) || left.line - right.line)
    .slice(0, limit);
}
```

- [ ] **Step 4: Implement recall command**

Replace the `recallCommand` stub with:

```js
function recallCommand(ctx, query, opts) {
  const home = agentsHome(ctx, opts);
  ensurePrivateState(home, ctx);
  const search = opts.query || query;
  if (!search || search === true) {
    throw new Error('Missing recall query. Use: awareness recall QUERY');
  }
  const limit = Number.parseInt(opts.limit || '10', 10);
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error('Invalid --limit. Use an integer >= 1.');
  }

  const results = recallMatches(home, search, limit);
  out(ctx, `Recall Results (${results.length})`);
  if (!results.length) {
    out(ctx, '- No matches.');
    return 0;
  }

  for (const result of results) {
    out(ctx, `- ${displayPath(home, result.file)}:${result.line}: ${result.text}`);
  }
  return 0;
}
```

- [ ] **Step 5: Run recall test**

Run: `npm test -- --test-name-pattern "recall searches memory"`

Expected: PASS.

- [ ] **Step 6: Run full tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/cli.js test/cli.test.js
git commit -m "Add deterministic recall command"
```

---

### Task 5: Implement Non-Destructive `awareness forget`

**Files:**
- Modify: `src/cli.js`
- Test: `test/cli.test.js`

**Interfaces:**
- Consumes: `appendToSection(content, section, addition)`, `replaceMetadata(content, key, value)`, `appendMemoryEvent(home, today, event)`.
- Produces: `awareness forget --text TEXT --reason TEXT --evidence TEXT`.

- [ ] **Step 1: Write failing forget test**

Add this test after the recall test:

```js
test('forget records a pruned memory without deleting history', () => {
  const home = tempHome();
  run(['init'], home);
  run([
    'remember',
    '--text', 'Temporary memory to revise',
    '--evidence', 'Initial observation',
  ], home);

  const result = run([
    'forget',
    '--text', 'Temporary memory to revise',
    '--reason', 'Superseded by explicit user correction',
    '--evidence', 'User correction',
  ], home);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Memory pruned or revised/);

  const memory = fs.readFileSync(path.join(home, 'memory', 'long-term.md'), 'utf8');
  assert.match(memory, /## Pruned Or Revised/);
  assert.match(memory, /Temporary memory to revise/);
  assert.match(memory, /Superseded by explicit user correction/);

  const events = fs.readFileSync(path.join(home, 'memory', 'events.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.equal(events.at(-1).type, 'memory.pruned');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern "forget records a pruned memory"`

Expected: FAIL with `forget command is not implemented yet`.

- [ ] **Step 3: Implement forget command**

Replace the `forgetCommand` stub with:

```js
function forgetCommand(ctx, opts) {
  const home = agentsHome(ctx, opts);
  ensurePrivateState(home, ctx);
  const text = required(opts, 'text');
  const reason = required(opts, 'reason');
  const evidence = required(opts, 'evidence');
  const today = todayParts(ctx);
  const file = longTermMemoryPath(home);
  let content = fs.readFileSync(file, 'utf8');
  content = replaceMetadata(content, 'Updated', formatTimestamp(today));
  content = appendToSection(content, 'Pruned Or Revised', `- ${today.date}: ${text} (reason: ${reason}; evidence: ${evidence})\n`);
  fs.writeFileSync(file, content);
  appendMemoryEvent(home, today, {
    type: 'memory.pruned',
    text,
    reason,
    evidence,
  });
  out(ctx, `Memory pruned or revised: ${text}`);
  return 0;
}
```

- [ ] **Step 4: Run forget test**

Run: `npm test -- --test-name-pattern "forget records a pruned memory"`

Expected: PASS.

- [ ] **Step 5: Run full tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/cli.js test/cli.test.js
git commit -m "Add non-destructive forget command"
```

---

### Task 6: Implement `awareness improve`

**Files:**
- Modify: `src/cli.js`
- Test: `test/cli.test.js`

**Interfaces:**
- Consumes: `buildEvaluation(home, today)`, `writeEvaluationIfMissing(home, today)`, `recordEvaluationMemoryCandidates(home, today)`, `repeatedMemoryCandidateSuggestions(content, minCount)`, `appendMemoryEvent(home, today, event)`.
- Produces: `awareness improve [--force] [--min-count N]`.

- [ ] **Step 1: Write failing improve test**

Add this test after the forget test:

```js
test('improve writes evaluation and surfaces repeated pattern suggestions', () => {
  const home = tempHome();
  run(['init'], home);
  run([
    'remember',
    '--text', 'Improve traceability before handoff',
    '--evidence', 'worklog/2099-01-01.md',
  ], home, { AWARENESS_NOW: '2099-01-01T12:34:00.000Z' });
  run([
    'remember',
    '--text', 'Improve traceability before handoff',
    '--evidence', 'worklog/2099-01-02.md',
  ], home);

  const result = run(['improve'], home);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Evaluation:/);
  assert.match(result.stdout, /Pattern suggestions: 1/);
  assert.match(result.stdout, /Improve traceability before handoff/);
  assert.equal(fs.existsSync(path.join(home, 'evaluations', '2099-01-02.md')), true);

  const events = fs.readFileSync(path.join(home, 'memory', 'events.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.equal(events.at(-1).type, 'pattern.suggested');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern "improve writes evaluation"`

Expected: FAIL with `improve command is not implemented yet`.

- [ ] **Step 3: Implement improve command**

Replace the `improveCommand` stub with:

```js
function improveCommand(ctx, opts) {
  const home = agentsHome(ctx, opts);
  ensurePrivateState(home, ctx);
  const today = todayParts(ctx);
  const evaluationPath = path.join(home, 'evaluations', `${today.date}.md`);
  const force = Boolean(opts.force);

  let evaluation;
  if (force && fs.existsSync(evaluationPath)) {
    fs.writeFileSync(evaluationPath, buildEvaluation(home, today));
    const candidates = recordEvaluationMemoryCandidates(home, today);
    evaluation = { file: evaluationPath, status: 'rewritten', candidates };
  } else {
    evaluation = writeEvaluationIfMissing(home, today);
  }

  appendMemoryEvent(home, today, {
    type: 'evaluation.created',
    file: evaluation.file,
    status: evaluation.status,
  });

  const minCount = Number.parseInt(opts.minCount || '2', 10);
  if (!Number.isInteger(minCount) || minCount < 2) {
    throw new Error('Invalid --min-count. Use an integer >= 2.');
  }

  const content = fs.readFileSync(longTermMemoryPath(home), 'utf8');
  const suggestions = repeatedMemoryCandidateSuggestions(content, minCount);
  for (const suggestion of suggestions) {
    appendMemoryEvent(home, today, {
      type: 'pattern.suggested',
      text: suggestion.text,
      count: suggestion.count,
      evidence: suggestion.evidence,
    });
  }

  out(ctx, `Evaluation: ${evaluation.status} (${evaluation.file})`);
  out(ctx, `Memory candidates: ${evaluation.candidates ? evaluation.candidates.length : 'not changed'}`);
  out(ctx, `Pattern suggestions: ${suggestions.length}`);
  for (const suggestion of suggestions) {
    out(ctx, `- ${suggestion.text} (${suggestion.count} observations)`);
    out(ctx, `  Promote: awareness memory promote --kind pattern --text "${shellQuoteText(suggestion.text)}" --evidence "${shellQuoteText(suggestion.evidence)}"`);
  }
  return 0;
}
```

- [ ] **Step 4: Run improve test**

Run: `npm test -- --test-name-pattern "improve writes evaluation"`

Expected: PASS.

- [ ] **Step 5: Run full tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/cli.js test/cli.test.js
git commit -m "Add improve command"
```

---

### Task 7: Update Docs, README, and Templates

**Files:**
- Modify: `docs/cli.md`
- Modify: `docs/memory.md`
- Modify: `README.md`
- Modify: `templates/agent-instructions.md`
- Modify: `templates/memory-long-term.md`

**Interfaces:**
- Consumes: command behavior from Tasks 1-6.
- Produces: user-facing guidance for remember, recall, forget, improve, and events.

- [ ] **Step 1: Write docs smoke test**

Add this test near existing init/help tests:

```js
test('documentation mentions local memory operations', () => {
  const cliDocs = fs.readFileSync(path.join(repoRootForTests(), 'docs', 'cli.md'), 'utf8');
  const memoryDocs = fs.readFileSync(path.join(repoRootForTests(), 'docs', 'memory.md'), 'utf8');
  const agentTemplate = fs.readFileSync(path.join(repoRootForTests(), 'templates', 'agent-instructions.md'), 'utf8');

  assert.match(cliDocs, /awareness remember/);
  assert.match(cliDocs, /awareness recall/);
  assert.match(cliDocs, /awareness forget/);
  assert.match(cliDocs, /awareness improve/);
  assert.match(memoryDocs, /memory\/events\.jsonl/);
  assert.match(agentTemplate, /awareness recall/);
});
```

Add this helper near `tempHome()`:

```js
function repoRootForTests() {
  return path.resolve(new URL('..', import.meta.url).pathname);
}
```

- [ ] **Step 2: Run docs test to verify it fails**

Run: `npm test -- --test-name-pattern "documentation mentions local memory operations"`

Expected: FAIL because docs do not yet mention all four top-level operations.

- [ ] **Step 3: Update `docs/cli.md`**

In the `memory` section, add:

````markdown
### Local memory operations

These commands provide a small Cognee-inspired operation vocabulary without adding a graph database or vector store.

```bash
awareness remember --text "Prefer recall before repeating implementation work" --evidence "User request"
awareness recall "implementation work"
awareness forget --text "Old assumption" --reason "Superseded by user correction" --evidence "Correction message"
awareness improve
```

`remember` records a promotion candidate and appends `memory.candidate.created` to `memory/events.jsonl`.
`recall` performs deterministic local text search across memory, memory events, worklogs, and evaluations.
`forget` records a prune/revision entry and appends `memory.pruned`; it does not destructively delete historical evidence.
`improve` runs the evaluation/review loop and appends `evaluation.created` and `pattern.suggested` events when applicable.
````

- [ ] **Step 4: Update `docs/memory.md`**

Add a section after "Memory Layers":

````markdown
## Local Operation Model

Awareness uses a small local operation vocabulary:

- `remember`: capture an evidence-backed candidate.
- `recall`: search local memory, events, worklogs, and evaluations.
- `forget`: prune or revise stale memory without destructive deletion.
- `improve`: run evaluation plus memory review to surface repeated candidates.

The append-only event log lives at:

```text
~/.agents/memory/events.jsonl
```

Markdown files remain the readable projection. The event log is the auditable history of memory operations.
````

- [ ] **Step 5: Update README private layout and quick start**

In the README private layout under `memory/`, add:

```text
    events.jsonl
```

In CLI Quick Start, add:

```bash
awareness remember --text "Useful local observation" --evidence "Source"
awareness recall "local observation"
awareness improve
```

- [ ] **Step 6: Update templates**

In `templates/agent-instructions.md`, add rules:

```markdown
- Use `awareness remember` for explicit observations that should enter memory review.
- Use `awareness recall QUERY` before repeating uncertain or previously solved work.
- Use `awareness forget --text TEXT --reason REASON --evidence EVIDENCE` when memory is stale, wrong, or superseded.
- Use `awareness improve` after material work or process friction to run evaluation plus memory review.
```

In `templates/memory-long-term.md`, add:

```markdown
## Event Log

- Append-only audit history: `memory/events.jsonl`
- Markdown sections are readable projections.
- Do not hand-edit event history.
```

- [ ] **Step 7: Run docs test**

Run: `npm test -- --test-name-pattern "documentation mentions local memory operations"`

Expected: PASS.

- [ ] **Step 8: Run full tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add README.md docs/cli.md docs/memory.md templates/agent-instructions.md templates/memory-long-term.md test/cli.test.js
git commit -m "Document local memory operations"
```

---

### Task 8: Final Verification and PR

**Files:**
- No code files expected unless verification finds a defect.

**Interfaces:**
- Consumes: all commits from Tasks 1-7.
- Produces: a reviewable PR for the local memory operation model.

- [ ] **Step 1: Run full test suite**

Run: `npm test`

Expected: PASS, including tests for:

```text
help lists local memory operation commands
memory note and promote append auditable memory events
remember records a promotion candidate and event
recall searches memory, events, worklogs, and evaluations
forget records a pruned memory without deleting history
improve writes evaluation and surfaces repeated pattern suggestions
documentation mentions local memory operations
```

- [ ] **Step 2: Manually smoke-test the commands against a temp home**

Run:

```bash
tmp_home="$(mktemp -d)"
node bin/awareness.js init --home "$tmp_home"
node bin/awareness.js remember --home "$tmp_home" --text "Smoke memory operation" --evidence "Manual smoke test"
node bin/awareness.js recall --home "$tmp_home" "Smoke memory"
node bin/awareness.js improve --home "$tmp_home"
node bin/awareness.js forget --home "$tmp_home" --text "Smoke memory operation" --reason "Smoke test cleanup" --evidence "Manual smoke test"
```

Expected:

```text
remember prints "Remembered candidate"
recall prints at least one result from memory/long-term.md or memory/events.jsonl
improve prints evaluation and pattern suggestion counts
forget prints "Memory pruned or revised"
```

- [ ] **Step 3: Inspect event log from smoke test**

Run:

```bash
tail -n 20 "$tmp_home/memory/events.jsonl"
```

Expected: JSON lines include `memory.candidate.created`, `evaluation.created`, and `memory.pruned`.

- [ ] **Step 4: Check worktree**

Run: `git status -sb`

Expected: clean branch with commits ready to push.

- [ ] **Step 5: Open PR**

Run:

```bash
git push -u origin codex/local-memory-operations
gh pr create --draft --base main --head codex/local-memory-operations --title "[codex] Add local memory operations" --body-file /private/tmp/local-memory-operations-pr.md
```

Use this PR body:

```markdown
## Summary

Adds a small local-first memory operation model inspired by Cognee without adding graph, vector, or service dependencies.

- Adds `remember`, `recall`, `forget`, and `improve`.
- Adds append-only `memory/events.jsonl` for auditable memory operations.
- Keeps Markdown files as human-readable projections.
- Documents how agents should use the new operations.

## Validation

- `npm test`
- Manual temp-home smoke test for remember/recall/improve/forget
```

- [ ] **Step 6: Request review before merge**

After PR creation, report:

```text
PR URL
branch name
commit list
test result
manual smoke result
```

Do not merge until the user explicitly approves.

---

## Self-Review

**Spec coverage:** The plan covers the approved design: operation vocabulary, append-only event log, Markdown projections, deterministic recall, non-destructive forget, improve as evaluation plus memory review, docs/templates, tests, and PR flow.

**Placeholder scan:** The plan contains no `TBD`, `TODO`, or unspecified implementation steps. Each code-changing step includes concrete code snippets and exact file paths.

**Type consistency:** Function names are consistent across tasks: `appendMemoryEvent`, `readMemoryEvents`, `memoryEventPath`, `rememberCommand`, `recallCommand`, `forgetCommand`, `improveCommand`, `collectRecallSources`, `recallMatches`.

**Scope check:** The plan avoids graph storage, embeddings, external services, new dependencies, and UI changes.
