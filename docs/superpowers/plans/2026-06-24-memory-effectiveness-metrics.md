# Memory Effectiveness Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure whether stored memory is actually *useful*, not just whether it grows. Add indicators across three levels — store health, utilization, and outcome — surfaced through a new `awareness memory stats` command and a composite Memory Efficiency Scorecard.

**Architecture:** Reuse the existing append-only logs (`memory/events.jsonl`, `runtime/recall/*.jsonl`) and the curated Markdown projection (`memory/long-term.md`). Add entry-level attribution to recall events so we can tell *which* curated entry was used, and a new `memory.used` event so an agent can credit a recall that genuinely helped. Keep aggregation in pure modules; keep `src/cli.js` thin (project convention: extract cohesive helpers, do not grow `cli.js`).

**Tech Stack:** Node.js ESM, built-in `fs`/`path`/`os`, current CLI parser in `src/cli.js`, the `src/metrics.js` + `src/stats.js` split established by `awareness stats`, Node test runner in `test/cli.test.js`, Markdown docs/templates.

## Global Constraints

- No graph database, embeddings, vector store, or external services.
- One small runtime dependency is allowed for local matching: MiniSearch. No graph database, embeddings, vector store, or external services.
- Local-first and private: read/aggregate only under `~/.agents`; never post anywhere.
- Markdown stays the human-readable projection; JSONL logs stay the auditable source.
- Backward compatible: pre-existing recall events (v0.3.3) lack `curatedHits`; aggregation must treat that as "no attribution" and never crash.
- Do not grow `src/cli.js` with aggregation logic — put it in dedicated modules.
- Entry identity is derived deterministically from entry text so the same memory keeps the same key across runs.

---

## Concepts and Data Model

### The three levels of "effectiveness"

| Level | Question | Data source | Status |
|-------|----------|-------------|--------|
| 1. Store health | Does the candidate→promote→prune funnel work and stay lean? | `memory/events.jsonl`, `long-term.md` | Measurable now |
| 2. Utilization | Is curated memory actually recalled, and which entries? | `runtime/recall/*.jsonl` (+ new `curatedHits`), `long-term.md` | Needs entry attribution |
| 3. Outcome | Did a recalled memory genuinely help? | new `memory.used` events | Needs feedback signal |

### Indicators

**Level 1 — Store health (from events + projection):**
- Conversion rate = `promoted / candidatesCreated` (window-scoped, with cross-window caveat surfaced).
- Time-to-promotion = median/avg days between a candidate's `memory.candidate.created` and its matching `memory.promoted` (matched by normalized text).
- Churn rate = `pruned / promoted`.
- Source mix = promotions grouped by candidate source (note/remember/evaluation).
- Growth vs prune = entries added vs pruned in window.
- Section density = curated entries per section.

**Level 2 — Utilization (needs `curatedHits` on recall events):**
- Activation rate = `distinct curated entries recalled ≥1× / total curated entries` ⭐ (primary signal).
- Dead weight = curated entries with zero recalls in window (list).
- Top workhorses = curated entries ranked by recall count.
- Time-to-first-recall = days between promotion and first recall hitting that entry.
- Recalls per session = `recall calls / sessions started`.
- Already measurable from recall alone: hit rate (`resultCount>0` share), avg results/query, zero-result count, and **repeated zero-result queries** ⭐ (the gap detector).

**Level 3 — Outcome (needs `memory.used`):**
- Useful-recall rate = `distinct entries credited used / distinct entries recalled`.
- Per-entry usefulness count.
- Contradiction/instability = entries that were pruned and later re-added (text reappears in a `candidate.created`/`promoted` after a `memory.pruned`).

### Composite: Memory Efficiency Scorecard (0–2 per dimension, mirrors `buildEvaluation`)

| Dimension | 2 (good) | 1 (fair) | 0 (poor) |
|-----------|----------|----------|----------|
| Activation | activation ≥ 0.6 | activation > 0 | no curated entry recalled |
| Precision | avg results in 1–8 **and** useful-recall ≥ 0.5 | avg results in 1–8 **or** some useful credit | avg results 0 or >12, no useful credit |
| Coverage | hit rate ≥ 0.8 and no repeated unresolved gaps | hit rate ≥ 0.5 | hit rate < 0.5 or repeated gaps pending |
| Pipeline | conversion 0.3–1.0, churn < 0.2, median TTP ≤ 3d | partial | conversion 0 or churn ≥ 0.5 |
| Freshness | ≥ 0.6 entries recalled/used in window, no contradictions | partial | nothing recent or contradictions present |

Total `/10`, with per-dimension evidence strings. Snapshot-able for trend tracking.

### New event/field shapes

Extended recall event (`runtime/recall/<date>.jsonl`):
```json
{"timestamp":"...","source":"recall","query":"observability","terms":1,"resultCount":10,
 "topFiles":["worklog/2026-06-23.md"],"curatedHits":["a1b2c3","d4e5f6"]}
```
`curatedHits` = deterministic keys of curated `long-term.md` entries whose lines matched. Absent on old events.

New usefulness event (`memory/events.jsonl`):
```json
{"timestamp":"...","type":"memory.used","key":"a1b2c3","text":"<curated entry text>","note":"<why it helped>"}
```

---

## File Structure

- Create `src/memory-metrics.js`: pure parsing + aggregation. `entryKey`, `parseCuratedEntries`, `curatedHitsForResults`, `collectMemoryMetrics`, scorecard computation.
- Create `src/search.js`: local MiniSearch wrapper for recall and `memory used` matching.
- Create `src/memory-stats.js`: text + JSON rendering for `awareness memory stats`.
- Modify `src/text.js`: keep shared normalization/query expansion and curated aliases for the MiniSearch wrapper. Lifts recall quality and the `memory used` matcher while staying local-first and avoiding embeddings/services.
- Modify `src/cli.js`: refactor `recallMatches` to use the shared scorer; extend `recallCommand` to log `curatedHits`; add `memory used` subcommand (shared matcher + `--key`); add `memory stats` subcommand; help text. Thin orchestration only.
- Modify `test/cli.test.js`: focused tests per task.
- Modify `docs/cli.md`: document `memory stats`, `memory used`, and the extended recall event.
- Modify `docs/memory.md`: explain the three levels, the scorecard, and the new event shapes.
- Modify `README.md`: mention `awareness memory stats` in quick start / layout.
- Modify `templates/agent-instructions.md`: instruct agents to credit useful recalls with `awareness memory used` and to review `memory stats`.

---

### Task 1: Curated-entry parsing and deterministic entry keys

**Files:**
- Create: `src/memory-metrics.js`
- Test: `test/cli.test.js`

**Interfaces:**
- Produces: `entryKey(text)`, `parseCuratedEntries(longTermContent)` returning `[{section, date, text, evidence, key, lineStart, lineEnd}]`.
- Consumes: nothing (pure string parsing).

- [ ] **Step 1: Write failing test**

Add to `test/cli.test.js`:

```js
import { entryKey, parseCuratedEntries } from '../src/memory-metrics.js';

test('parseCuratedEntries extracts curated entries with stable keys', () => {
  const content = [
    '# Long-Term Memory', '',
    '## Preferences', '',
    '- 2026-06-19: Prefer ripgrep over grep (evidence: repeated use)',
    '',
    '## Patterns', '',
    '- None yet.',
    '',
    '## Project Conventions', '',
    '- 2026-06-20: Keep src/cli.js thin (evidence: PR #11)',
    '',
  ].join('\n');

  const entries = parseCuratedEntries(content);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].section, 'Preferences');
  assert.match(entries[0].text, /Prefer ripgrep over grep/);
  assert.equal(entries[0].key, entryKey('Prefer ripgrep over grep'));
  // "- None yet." placeholders are ignored
  assert.ok(!entries.some((e) => e.text.includes('None yet')));
  // key is stable and whitespace/case-insensitive
  assert.equal(entryKey('Keep   SRC/cli.js  thin'), entryKey('keep src/cli.js thin'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern "parseCuratedEntries"`

Expected: FAIL (module does not exist).

- [ ] **Step 3: Implement `src/memory-metrics.js` (parsing portion)**

Create `src/memory-metrics.js`:

```js
// Pure aggregation for memory effectiveness metrics. No fs in the parsing
// helpers so they stay unit-testable; collectMemoryMetrics (later task) does
// the fs reads and delegates here.

const CURATED_SECTIONS = ['Preferences', 'Patterns', 'Project Conventions', 'Review Guidance'];
const ENTRY_LINE = /^- (\d{4}-\d{2}-\d{2}): (.*)$/;

// Deterministic, dependency-free key for a curated entry, derived from its
// text only (date/evidence excluded) so the same memory keeps the same id.
export function entryKey(text) {
  const norm = normalizeEntryText(text);
  let hash = 5381;
  for (let i = 0; i < norm.length; i += 1) {
    hash = ((hash * 33) ^ norm.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

export function normalizeEntryText(text) {
  return String(text).toLowerCase().replace(/\s+/g, ' ').trim();
}

// Split a curated entry line into its statement and evidence, e.g.
// "Prefer X (evidence: ...)" -> { text: "Prefer X", evidence: "..." }.
function splitEntryBody(body) {
  const match = body.match(/^(.*?)\s*\(evidence:\s*(.*)\)\s*$/);
  if (match) return { text: match[1].trim(), evidence: match[2].trim() };
  return { text: body.trim(), evidence: '' };
}

export function parseCuratedEntries(content) {
  const lines = content.split('\n');
  const entries = [];
  let section = null;
  lines.forEach((line, index) => {
    const heading = line.match(/^## (.+)$/);
    if (heading) {
      section = CURATED_SECTIONS.includes(heading[1].trim()) ? heading[1].trim() : null;
      return;
    }
    if (!section) return;
    const entry = line.match(ENTRY_LINE);
    if (!entry) return;
    const { text, evidence } = splitEntryBody(entry[2]);
    if (!text || text === 'None yet.') return;
    entries.push({
      section,
      date: entry[1],
      text,
      evidence,
      key: entryKey(text),
      lineStart: index + 1,
      lineEnd: index + 1,
    });
  });
  return entries;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --test-name-pattern "parseCuratedEntries"`

Expected: PASS.

- [ ] **Step 5: Run full tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/memory-metrics.js test/cli.test.js
git commit -m "Add curated-entry parsing and deterministic entry keys"
```

---

### Task 2: Strengthen deterministic matching in `src/text.js`

**Files:**
- Modify: `src/text.js`, `src/cli.js`
- Test: `test/cli.test.js`

**Goal/rationale:** Improve recall quality (higher hit rate, fewer false zero-results) and give `awareness memory used` (Task 4) a smarter, shared matcher — all deterministic, dependency-free, **no embeddings**. Three *additive* improvements: curated synonyms, phrase/adjacency scoring, and conservative stemming. Because `recallMatches` and `memory used` both build on `src/text.js`, improving it lifts both at once. This is the local-first alternative to semantic recall; if effectiveness metrics later show many repeated zero-result gaps with low hit rate, a separate opt-in `recall --semantic` (local model only) can be revisited.

**Interfaces:**
- Produces: `queryBigrams(query)`, `scoreText(haystack, termGroups, bigrams)` in `text.js`; expanded `RECALL_ALIASES`; extended `recallTokenVariants` (conservative, length-guarded, additive).
- Consumes: existing `normalizeSearchText`, `recallTermGroups`.
- `recallMatches` in `cli.js` is refactored to call `scoreText` (behavior-preserving except the new boosts only ever *raise* scores or *broaden* matches).

- [ ] **Step 1: Write failing tests**

```js
import { scoreText, queryBigrams, recallTermGroups } from '../src/text.js';

test('matching: synonyms, phrase boost, and conservative stemming', () => {
  // synonym expansion: query "repository" reaches text "repo"
  let g = recallTermGroups('repository');
  assert.ok(scoreText('sync the repo nightly', g) > 0);
  // conservative stem: query "testing" reaches text "test"
  g = recallTermGroups('testing the flow');
  assert.ok(scoreText('run the test suite', g) > 0);
  // phrase boost: adjacent pair outranks scattered terms
  g = recallTermGroups('release process');
  const bg = queryBigrams('release process');
  const adjacent = scoreText('document the release process here', g, bg);
  const scattered = scoreText('release notes mention the build process', g, bg);
  assert.ok(adjacent > scattered);
});

test('recall finds entries via synonym expansion', () => {
  const home = tempHome();
  run(['init'], home);
  run(['remember', '--text', 'Sync the repo nightly', '--evidence', 'e'], home);
  const result = run(['recall', 'repository'], home);
  assert.match(result.stdout, /Sync the repo nightly/);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- --test-name-pattern "matching: synonyms"`

Expected: FAIL (`scoreText`/`queryBigrams` not exported; synonym not yet wired).

- [ ] **Step 3: Extend `src/text.js`**

Expand the alias map (small, curated, bidirectional):

```js
const RECALL_ALIASES = {
  memoria: ['memory'], memorias: ['memory'], memory: ['memoria', 'memorias'],
  user: ['usuario', 'usuarios'], users: ['usuario', 'usuarios'],
  usuario: ['user', 'users'], usuarios: ['user', 'users'],
  repo: ['repository', 'repositorio'], repository: ['repo', 'repositorio'], repositorio: ['repo', 'repository'],
  config: ['configuration', 'configuracion'], configuration: ['config', 'configuracion'], configuracion: ['config', 'configuration'],
  db: ['database'], database: ['db'],
  release: ['publish', 'version'], publish: ['release'],
};
```

Add the scorer and bigram helpers:

```js
// Adjacent normalized token pairs, e.g. "release process" -> ["release process"].
export function queryBigrams(query) {
  const tokens = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  const pairs = [];
  for (let i = 0; i + 1 < tokens.length; i += 1) pairs.push(`${tokens[i]} ${tokens[i + 1]}`);
  return pairs;
}

// Score a haystack against pre-computed term groups, with a +1 phrase boost
// per adjacent query pair found verbatim. Deterministic; boosts never create
// matches where there were none (a zero-term-group line stays 0 unless a pair
// hits, which implies its terms hit too).
export function scoreText(haystack, termGroups, bigrams = []) {
  const norm = normalizeSearchText(haystack);
  let score = termGroups.filter((terms) => terms.some((term) => norm.includes(term))).length;
  for (const pair of bigrams) if (norm.includes(pair)) score += 1;
  return score;
}
```

Extend `recallTokenVariants` with conservative, length-guarded suffix stripping (additive — originals are always kept; over-stemming only adds an extra OR-term, bounded by scoring):

```js
function recallTokenVariants(term) {
  const variants = [];
  if (term.endsWith('es') && term.length > 4) variants.push(term.slice(0, -2));
  if (term.endsWith('s') && term.length > 3) variants.push(term.slice(0, -1));
  if (term.endsWith('ing') && term.length > 5) variants.push(term.slice(0, -3));
  if (term.endsWith('ed') && term.length > 4) variants.push(term.slice(0, -2));
  if (term.endsWith('mente') && term.length > 7) variants.push(term.slice(0, -5));
  return variants.filter((variant) => variant.length >= 3);
}
```

- [ ] **Step 4: Refactor `recallMatches` in `src/cli.js` to use the shared scorer**

Add import: `import { queryBigrams, scoreText } from './text.js';` (extend the existing `text.js` import line).

Replace the per-line scoring in `recallMatches`:

```js
function recallMatches(home, query, limit) {
  const termGroups = recallTermGroups(query);
  const bigrams = queryBigrams(query);
  const results = [];
  for (const file of collectRecallSources(home)) {
    const content = fs.readFileSync(file, 'utf8');
    content.split('\n').forEach((line, index) => {
      const score = scoreText(line, termGroups, bigrams);
      if (score > 0) results.push({ file, line: index + 1, score, text: line.trim() });
    });
  }
  results.sort((left, right) => right.score - left.score || left.file.localeCompare(right.file) || left.line - right.line);
  return results.slice(0, limit);
}
```

- [ ] **Step 5: Run tests** — `npm test -- --test-name-pattern "matching: synonyms"` then `npm test -- --test-name-pattern "recall finds entries via synonym"` then `npm test` — Expected: PASS (existing recall tests still hold; matching only broadens/ranks).

- [ ] **Step 6: Commit**

```bash
git add src/text.js src/cli.js test/cli.test.js
git commit -m "Strengthen deterministic recall matching (synonyms, phrase boost, stemming)"
```

---

### Task 3: Attribute recalls to curated entries

**Files:**
- Modify: `src/cli.js`, `src/memory-metrics.js`
- Test: `test/cli.test.js`

**Interfaces:**
- Produces: `curatedHitsForResults(longTermContent, results, longTermPath)` in `memory-metrics.js`; `recallCommand` now writes `curatedHits` into the recall event.
- Consumes: existing `recallMatches`, `appendRuntimeEvent`, `displayPath`, `longTermMemoryPath`.

- [ ] **Step 1: Write failing test**

```js
test('recall attributes hits to curated long-term entries', () => {
  const home = tempHome();
  run(['init'], home);
  run(['memory', 'promote',
    '--kind', 'preference',
    '--text', 'Prefer ripgrep over grep for searches',
    '--evidence', 'User request'], home);

  const result = run(['recall', 'ripgrep'], home);
  assert.equal(result.code, 0);

  const event = JSON.parse(
    fs.readFileSync(path.join(home, 'runtime', 'recall', '2099-01-02.jsonl'), 'utf8').trim().split('\n').pop(),
  );
  assert.ok(Array.isArray(event.curatedHits));
  assert.ok(event.curatedHits.length >= 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern "recall attributes hits"`

Expected: FAIL (`curatedHits` undefined).

- [ ] **Step 3: Add `curatedHitsForResults` to `src/memory-metrics.js`**

```js
import { parseCuratedEntries } from internal scope; // already in this module

// Given recall results (each {file, line}) and the long-term content/path,
// return the unique keys of curated entries whose lines were matched.
export function curatedHitsForResults(longTermContent, results, longTermPath) {
  const entries = parseCuratedEntries(longTermContent);
  const hits = new Set();
  for (const result of results) {
    if (result.file !== longTermPath) continue;
    const entry = entries.find((e) => result.line >= e.lineStart && result.line <= e.lineEnd);
    if (entry) hits.add(entry.key);
  }
  return [...hits];
}
```

(Define within the same module; `parseCuratedEntries` is already exported there.)

- [ ] **Step 4: Wire into `recallCommand` in `src/cli.js`**

Add the import:

```js
import { curatedHitsForResults } from './memory-metrics.js';
```

In `recallCommand`, replace the `appendRuntimeEvent(... 'recall' ...)` call so it computes curated hits before logging:

```js
  const results = recallMatches(home, search, limit);
  const longTermPath = longTermMemoryPath(home);
  const longTermContent = fs.existsSync(longTermPath) ? fs.readFileSync(longTermPath, 'utf8') : '';
  appendRuntimeEvent(home, todayParts(ctx), 'recall', {
    source: 'recall',
    query: String(search),
    terms: recallTermGroups(String(search)).length,
    resultCount: results.length,
    topFiles: [...new Set(results.map((result) => displayPath(home, result.file)))].slice(0, 5),
    curatedHits: curatedHitsForResults(longTermContent, results, longTermPath),
  });
```

Note: `recallMatches` returns absolute `file` paths, and `longTermMemoryPath(home)` is absolute, so the equality check in `curatedHitsForResults` is on absolute paths. Keep it that way.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- --test-name-pattern "recall attributes hits"`

Expected: PASS.

- [ ] **Step 6: Run full tests** — `npm test` — Expected: PASS (existing recall tests still hold; they don't assert absence of `curatedHits`).

- [ ] **Step 7: Commit**

```bash
git add src/cli.js src/memory-metrics.js test/cli.test.js
git commit -m "Attribute recall hits to curated memory entries"
```

---

### Task 4: `awareness memory used` — credit a helpful recall

**Files:**
- Modify: `src/cli.js`
- Test: `test/cli.test.js`

**Interfaces:**
- Produces: `awareness memory used (--text TEXT | --key KEY) [--note TEXT]`, appending a `memory.used` event keyed to the matched curated entry.
- Consumes: `appendMemoryEvent`, `longTermMemoryPath`, `parseCuratedEntries`; the shared matcher from Task 2 (`recallTermGroups`, `queryBigrams`, `scoreText`).
- Matching uses the same scorer as recall (synonyms/phrase/stemming) for natural-language `--text`, and `--key` (the `entryKey` shown by `memory stats --json`) as an exact, deterministic override for ambiguity.

- [ ] **Step 1: Write failing test**

```js
test('memory used credits a curated entry with a memory.used event', () => {
  const home = tempHome();
  run(['init'], home);
  run(['memory', 'promote',
    '--kind', 'preference',
    '--text', 'Prefer ripgrep over grep for searches',
    '--evidence', 'User request'], home);

  const result = run(['memory', 'used',
    '--text', 'ripgrep over grep',
    '--note', 'Used it to pick the search tool'], home);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /Credited memory as used/);

  const event = JSON.parse(
    fs.readFileSync(path.join(home, 'memory', 'events.jsonl'), 'utf8').trim().split('\n').pop(),
  );
  assert.equal(event.type, 'memory.used');
  assert.match(event.text, /Prefer ripgrep over grep/);
  assert.ok(event.key);
});

test('memory used accepts an exact --key override', () => {
  const home = tempHome();
  run(['init'], home);
  run(['memory', 'promote', '--kind', 'preference',
    '--text', 'Prefer ripgrep over grep for searches', '--evidence', 'e'], home);
  const key = entryKey('Prefer ripgrep over grep for searches');

  const result = run(['memory', 'used', '--key', key], home);
  assert.equal(result.code, 0);
  const event = JSON.parse(
    fs.readFileSync(path.join(home, 'memory', 'events.jsonl'), 'utf8').trim().split('\n').pop(),
  );
  assert.equal(event.key, key);
});

test('memory used reports when no curated entry matches', () => {
  const home = tempHome();
  run(['init'], home);
  const result = run(['memory', 'used', '--text', 'nonexistent-topic-zzz'], home);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /No curated memory matches/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern "memory used"`

Expected: FAIL (subcommand unknown).

- [ ] **Step 3: Route the subcommand**

In `memoryCommand`'s switch in `src/cli.js`, add:

```js
    case 'used':
      return memoryUsedCommand(ctx, home, opts);
```

Update the `default` error string to include `used`.

- [ ] **Step 4: Implement `memoryUsedCommand`**

Add `import { parseCuratedEntries } from './memory-metrics.js';` and extend the `text.js` import to include `queryBigrams, scoreText` (`recallTermGroups` is already imported), then:

```js
function memoryUsedCommand(ctx, home, opts) {
  const today = todayParts(ctx);
  const entries = parseCuratedEntries(fs.readFileSync(longTermMemoryPath(home), 'utf8'));

  let entry;
  if (opts.key && opts.key !== true) {
    entry = entries.find((candidate) => candidate.key === opts.key);
    if (!entry) {
      err(ctx, `No curated entry with key: ${opts.key}`);
      return 1;
    }
  } else {
    const query = required(opts, 'text');
    const termGroups = recallTermGroups(query);
    const bigrams = queryBigrams(query);
    const ranked = entries
      .map((candidate) => ({ candidate, score: scoreText(candidate.text, termGroups, bigrams) }))
      .filter((row) => row.score > 0)
      .sort((left, right) => right.score - left.score);

    if (!ranked.length) {
      err(ctx, `No curated memory matches: ${query}`);
      return 1;
    }
    if (ranked.length > 1 && ranked[0].score === ranked[1].score) {
      err(ctx, `Ambiguous: multiple curated entries match "${query}" equally. Use --key.`);
      for (const row of ranked.filter((candidate) => candidate.score === ranked[0].score)) {
        err(ctx, `- [${row.candidate.key}] ${row.candidate.text}`);
      }
      return 1;
    }
    entry = ranked[0].candidate;
  }

  appendMemoryEvent(home, today, {
    type: 'memory.used',
    key: entry.key,
    section: entry.section,
    text: entry.text,
    note: opts.note || '',
  });
  out(ctx, `Credited memory as used: ${entry.text}`);
  return 0;
}
```

- [ ] **Step 5: Add help line**

In `printHelp`, after the `awareness memory promote ...` line, add:

```text
  awareness memory used (--text TEXT | --key KEY) [--note TEXT] [--home PATH]
```

- [ ] **Step 6: Run tests** — `npm test -- --test-name-pattern "memory used"` then `npm test` — Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/cli.js test/cli.test.js
git commit -m "Add memory used command to credit helpful recalls"
```

---

### Task 5: Aggregate memory metrics and compute the scorecard

**Files:**
- Modify: `src/memory-metrics.js`
- Test: `test/cli.test.js`

**Interfaces:**
- Produces: `collectMemoryMetrics(home, referenceDate, since)` returning the full metrics object including `scorecard`.
- Consumes: `fs`, `path`; `windowBounds`/`withinWindow`/`parseJsonl`/`readRuntimeEvents` reused from `src/metrics.js` (import them); `parseCuratedEntries`.

- [ ] **Step 1: Write failing test (synthetic home)**

```js
import { collectMemoryMetrics } from '../src/memory-metrics.js';

test('collectMemoryMetrics computes funnel, activation, and scorecard', () => {
  const home = tempHome();
  run(['init'], home);
  // candidate -> promotion (conversion + TTP)
  run(['remember', '--text', 'Prefer ripgrep over grep', '--evidence', 'e'], home);
  run(['memory', 'promote', '--kind', 'preference',
    '--text', 'Prefer ripgrep over grep', '--evidence', 'User request'], home);
  // a recall that hits it, plus a zero-result query (gap) twice
  run(['recall', 'ripgrep'], home);
  run(['recall', 'kubernetes-thing'], home);
  run(['recall', 'kubernetes-thing'], home);
  // credit usefulness
  run(['memory', 'used', '--text', 'ripgrep', '--note', 'helped'], home);

  const m = collectMemoryMetrics(home, new Date('2099-01-02T12:34:00.000Z'), 'all');
  assert.equal(m.store.candidatesCreated >= 1, true);
  assert.equal(m.store.promoted >= 1, true);
  assert.equal(m.utilization.curatedTotal >= 1, true);
  assert.ok(m.utilization.activationRate > 0);          // ripgrep entry was recalled
  assert.equal(m.coverage.repeatedZeroResultQueries.length >= 1, true); // kubernetes-thing x2
  assert.ok(m.outcome.usefulRecallRate > 0);
  assert.equal(typeof m.scorecard.total, 'number');
  assert.equal(m.scorecard.dimensions.length, 5);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern "collectMemoryMetrics"`

Expected: FAIL (function not exported).

- [ ] **Step 3: Implement aggregation in `src/memory-metrics.js`**

Add imports at the top of the module:

```js
import fs from 'node:fs';
import path from 'node:path';
import { windowBounds, withinWindow, parseJsonl, readRuntimeEvents } from './metrics.js';
```

Add the aggregator and helpers:

```js
export function collectMemoryMetrics(home, referenceDate, since = '7d') {
  const bounds = windowBounds(referenceDate, since);
  const events = readMemoryEvents(home).filter((e) => withinWindow(eventDate(e), bounds));
  const recalls = readRuntimeEvents(home, 'recall', bounds).filter((e) => e.source === 'recall');
  const entries = parseCuratedEntries(readLongTerm(home));
  const sessions = readRuntimeEvents(home, 'hooks', bounds)
    .filter((e) => e.event === 'session-start').length;

  const store = summarizeStore(events);
  const utilization = summarizeUtilization(entries, recalls, sessions);
  const coverage = summarizeCoverage(recalls);
  const outcome = summarizeOutcome(events, entries, recalls);
  const pipeline = summarizePipeline(events, store);
  const scorecard = buildScorecard({ store, utilization, coverage, outcome, pipeline });

  return { window: bounds, store, utilization, coverage, outcome, pipeline, scorecard };
}

function summarizeStore(events) {
  const candidates = events.filter((e) => e.type === 'memory.candidate.created');
  const promoted = events.filter((e) => e.type === 'memory.promoted');
  const pruned = events.filter((e) => e.type === 'memory.pruned');
  return {
    candidatesCreated: candidates.length,
    candidatesBySource: tally(candidates, 'source'),
    promoted: promoted.length,
    promotedByKind: tally(promoted, 'kind'),
    pruned: pruned.length,
    conversionRate: candidates.length ? promoted.length / candidates.length : 0,
    churnRate: promoted.length ? pruned.length / promoted.length : 0,
  };
}

function summarizeUtilization(entries, recalls, sessions) {
  const recalledKeys = new Set(recalls.flatMap((r) => Array.isArray(r.curatedHits) ? r.curatedHits : []));
  const hitCounts = {};
  for (const r of recalls) for (const k of (r.curatedHits || [])) hitCounts[k] = (hitCounts[k] || 0) + 1;
  const deadWeight = entries.filter((e) => !recalledKeys.has(e.key)).map((e) => ({ section: e.section, text: e.text }));
  const workhorses = entries
    .map((e) => ({ section: e.section, text: e.text, recalls: hitCounts[e.key] || 0 }))
    .filter((e) => e.recalls > 0)
    .sort((a, b) => b.recalls - a.recalls)
    .slice(0, 5);
  return {
    curatedTotal: entries.length,
    curatedRecalled: [...recalledKeys].filter((k) => entries.some((e) => e.key === k)).length,
    activationRate: entries.length ? recalledKeys.size ? [...recalledKeys].filter((k) => entries.some((e) => e.key === k)).length / entries.length : 0 : 0,
    deadWeight,
    workhorses,
    recallsPerSession: sessions ? recalls.length / sessions : 0,
  };
}

function summarizeCoverage(recalls) {
  const zero = recalls.filter((r) => Number(r.resultCount) === 0);
  const grouped = {};
  for (const r of zero) {
    const q = normalizeEntryText(r.query || '');
    grouped[q] = (grouped[q] || 0) + 1;
  }
  const repeated = Object.entries(grouped)
    .filter(([, n]) => n >= 2)
    .map(([query, count]) => ({ query, count }))
    .sort((a, b) => b.count - a.count);
  return {
    calls: recalls.length,
    hitRate: recalls.length ? (recalls.length - zero.length) / recalls.length : 0,
    zeroResultQueries: zero.length,
    repeatedZeroResultQueries: repeated,
  };
}

function summarizeOutcome(events, entries, recalls) {
  const used = events.filter((e) => e.type === 'memory.used');
  const usedKeys = new Set(used.map((e) => e.key));
  const recalledKeys = new Set(recalls.flatMap((r) => r.curatedHits || []));
  const usefulRecallRate = recalledKeys.size
    ? [...usedKeys].filter((k) => recalledKeys.has(k)).length / recalledKeys.size
    : 0;
  // contradictions: text pruned then re-added later
  const pruned = events.filter((e) => e.type === 'memory.pruned');
  const readded = events.filter((e) => e.type === 'memory.candidate.created' || e.type === 'memory.promoted');
  const contradictions = pruned.filter((p) => readded.some(
    (r) => normalizeEntryText(r.text || '') === normalizeEntryText(p.text || '') && r.timestamp > p.timestamp,
  )).length;
  return {
    usedEvents: used.length,
    distinctEntriesUsed: usedKeys.size,
    usefulRecallRate,
    perEntryUsage: tally(used, 'text'),
    contradictions,
  };
}

function summarizePipeline(events, store) {
  // median time-to-promotion in days, matching promoted text to the earliest candidate of same text
  const candidateTimes = {};
  for (const e of events.filter((x) => x.type === 'memory.candidate.created')) {
    const key = normalizeEntryText(e.text || '');
    const t = toEpoch(e.timestamp);
    if (candidateTimes[key] === undefined || t < candidateTimes[key]) candidateTimes[key] = t;
  }
  const deltas = [];
  for (const e of events.filter((x) => x.type === 'memory.promoted')) {
    const key = normalizeEntryText(e.text || '');
    if (candidateTimes[key] !== undefined) {
      deltas.push((toEpoch(e.timestamp) - candidateTimes[key]) / 86400000);
    }
  }
  return {
    conversionRate: store.conversionRate,
    churnRate: store.churnRate,
    medianTimeToPromotionDays: median(deltas),
    sourceMix: store.candidatesBySource,
  };
}

function buildScorecard({ store, utilization, coverage, outcome, pipeline }) {
  const dimensions = [
    score('Activation', activationScore(utilization), `${(utilization.activationRate * 100).toFixed(0)}% of ${utilization.curatedTotal} curated entries recalled`),
    score('Precision', precisionScore(coverage, outcome), `avg results n/a here; useful-recall ${(outcome.usefulRecallRate * 100).toFixed(0)}%`),
    score('Coverage', coverageScore(coverage), `hit rate ${(coverage.hitRate * 100).toFixed(0)}%, ${coverage.repeatedZeroResultQueries.length} repeated gap(s)`),
    score('Pipeline', pipelineScore(pipeline), `conversion ${(pipeline.conversionRate * 100).toFixed(0)}%, churn ${(pipeline.churnRate * 100).toFixed(0)}%, TTP ${fmtDays(pipeline.medianTimeToPromotionDays)}`),
    score('Freshness', freshnessScore(utilization, outcome), `${utilization.curatedRecalled}/${utilization.curatedTotal} recalled, ${outcome.contradictions} contradiction(s)`),
  ];
  return { dimensions, total: dimensions.reduce((sum, d) => sum + d.score, 0), max: 10 };
}

// --- small helpers ---
function readMemoryEvents(home) {
  const file = path.join(home, 'memory', 'events.jsonl');
  return fs.existsSync(file) ? parseJsonl(fs.readFileSync(file, 'utf8')) : [];
}
function readLongTerm(home) {
  const file = path.join(home, 'memory', 'long-term.md');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}
function tally(items, key) {
  const out = {};
  for (const i of items) { const v = i[key]; if (v != null) out[v] = (out[v] || 0) + 1; }
  return out;
}
function eventDate(e) { return typeof e.timestamp === 'string' ? e.timestamp.slice(0, 10) : ''; }
function toEpoch(ts) { const d = new Date(String(ts).replace(' ', 'T').slice(0, 16)); return Number.isNaN(d.getTime()) ? 0 : d.getTime(); }
function median(xs) { if (!xs.length) return null; const s = [...xs].toSorted((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function fmtDays(d) { return d == null ? 'n/a' : `${d.toFixed(1)}d`; }
function score(name, value, evidence) { return { name, score: value, evidence }; }
function activationScore(u) { return u.activationRate >= 0.6 ? 2 : u.activationRate > 0 ? 1 : 0; }
function precisionScore(c, o) { return o.usefulRecallRate >= 0.5 ? 2 : (o.usedEvents > 0 || c.hitRate >= 0.5) ? 1 : 0; }
function coverageScore(c) { return c.hitRate >= 0.8 && !c.repeatedZeroResultQueries.length ? 2 : c.hitRate >= 0.5 ? 1 : 0; }
function pipelineScore(p) { return (p.conversionRate >= 0.3 && p.churnRate < 0.2 && (p.medianTimeToPromotionDays == null || p.medianTimeToPromotionDays <= 3)) ? 2 : (p.conversionRate > 0 && p.churnRate < 0.5) ? 1 : 0; }
function freshnessScore(u, o) { const frac = u.curatedTotal ? u.curatedRecalled / u.curatedTotal : 0; return (frac >= 0.6 && !o.contradictions) ? 2 : (frac > 0 && !o.contradictions) ? 1 : 0; }
```

(`normalizeEntryText` and `parseCuratedEntries` already live in this module.)

- [ ] **Step 4: Run tests** — `npm test -- --test-name-pattern "collectMemoryMetrics"` then `npm test` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/memory-metrics.js test/cli.test.js
git commit -m "Aggregate memory effectiveness metrics and scorecard"
```

---

### Task 6: `awareness memory stats` command (text + JSON + snapshot)

**Files:**
- Create: `src/memory-stats.js`
- Modify: `src/cli.js`
- Test: `test/cli.test.js`

**Interfaces:**
- Produces: `renderMemoryStatsText(metrics)`, `renderMemoryStatsJson(metrics)`; `awareness memory stats [--since today|7d|30d|all] [--json] [--snapshot]`.
- Consumes: `collectMemoryMetrics`, `isValidWindow`, `referenceNow`, `appendRuntimeEvent`.

- [ ] **Step 1: Write failing test**

```js
test('memory stats renders a scorecard and supports json + snapshot', () => {
  const home = tempHome();
  run(['init'], home);
  run(['memory', 'promote', '--kind', 'preference',
    '--text', 'Prefer ripgrep over grep', '--evidence', 'e'], home);
  run(['recall', 'ripgrep'], home);

  const text = run(['memory', 'stats', '--since', 'all'], home);
  assert.equal(text.code, 0);
  assert.match(text.stdout, /Memory Efficiency/);
  assert.match(text.stdout, /Activation/);
  assert.match(text.stdout, /Scorecard/);

  const json = run(['memory', 'stats', '--since', '7d', '--json', '--snapshot'], home);
  const parsed = JSON.parse(json.stdout);
  assert.equal(typeof parsed.scorecard.total, 'number');
  const snap = path.join(home, 'runtime', 'metrics', '2099-01-02.jsonl');
  assert.equal(fs.existsSync(snap), true);
  assert.match(fs.readFileSync(snap, 'utf8'), /memory.stats.snapshot/);
});

test('memory stats rejects an invalid window', () => {
  const home = tempHome();
  run(['init'], home);
  const result = run(['memory', 'stats', '--since', 'eternity'], home);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Invalid --since/);
});
```

- [ ] **Step 2: Run test to verify it fails** — `npm test -- --test-name-pattern "memory stats"` — Expected: FAIL.

- [ ] **Step 3: Implement `src/memory-stats.js`**

```js
// Rendering for `awareness memory stats`. Pure string builders.

export function renderMemoryStatsJson(metrics) {
  return JSON.stringify(metrics, null, 2);
}

export function renderMemoryStatsText(m) {
  const w = m.window.from ? `${m.window.from} -> ${m.window.to}` : `all time (through ${m.window.to})`;
  const lines = [
    `Memory Efficiency (${m.window.since}: ${w})`,
    '',
    'Scorecard',
    ...m.scorecard.dimensions.map((d) => `- ${d.name}: ${d.score}/2  (${d.evidence})`),
    `- Total: ${m.scorecard.total}/${m.scorecard.max}`,
    '',
    'Store health',
    `- Candidates: ${m.store.candidatesCreated}  Promoted: ${m.store.promoted}  Pruned: ${m.store.pruned}`,
    `- Conversion: ${pct(m.store.conversionRate)}  Churn: ${pct(m.store.churnRate)}  Median time-to-promotion: ${m.pipeline.medianTimeToPromotionDays == null ? 'n/a' : m.pipeline.medianTimeToPromotionDays.toFixed(1) + 'd'}`,
    '',
    'Utilization',
    `- Activation: ${pct(m.utilization.activationRate)} (${m.utilization.curatedRecalled}/${m.utilization.curatedTotal} entries recalled)`,
    `- Recalls/session: ${m.utilization.recallsPerSession.toFixed(2)}`,
    `- Workhorses: ${m.utilization.workhorses.length ? m.utilization.workhorses.map((e) => `${truncate(e.text)} (${e.recalls})`).join(', ') : 'none'}`,
    `- Dead weight (never recalled): ${m.utilization.deadWeight.length}`,
    '',
    'Coverage',
    `- Hit rate: ${pct(m.coverage.hitRate)} over ${m.coverage.calls} call(s)`,
    `- Repeated gaps (zero-result, >=2x): ${m.coverage.repeatedZeroResultQueries.length ? m.coverage.repeatedZeroResultQueries.map((g) => `"${g.query}" (${g.count})`).join(', ') : 'none'}`,
    '',
    'Outcome',
    `- Useful-recall rate: ${pct(m.outcome.usefulRecallRate)} (${m.outcome.distinctEntriesUsed} entrie(s) credited)`,
    `- Contradictions: ${m.outcome.contradictions}`,
  ];
  return lines.join('\n');
}

function pct(v) { return `${Math.round((v || 0) * 100)}%`; }
function truncate(s, n = 40) { return s.length > n ? `${s.slice(0, n - 1)}…` : s; }
```

- [ ] **Step 4: Route the subcommand in `src/cli.js`**

Add imports:

```js
import { collectMemoryMetrics } from './memory-metrics.js';
import { renderMemoryStatsText, renderMemoryStatsJson } from './memory-stats.js';
```

In `memoryCommand`'s switch, add:

```js
    case 'stats':
      return memoryStatsCommand(ctx, home, opts);
```

Update the `default` error string to include `stats`. Implement:

```js
function memoryStatsCommand(ctx, home, opts) {
  const since = opts.since || '7d';
  if (!isValidWindow(since)) {
    throw new Error(`Invalid --since: ${since}. Valid windows: today, 7d, 30d, all`);
  }
  const metrics = collectMemoryMetrics(home, referenceNow(ctx), since);
  if (opts.snapshot) {
    appendRuntimeEvent(home, todayParts(ctx), 'metrics', { source: 'memory.stats.snapshot', since, metrics });
  }
  out(ctx, opts.json ? renderMemoryStatsJson(metrics) : renderMemoryStatsText(metrics));
  return 0;
}
```

(`isValidWindow` is already imported for `awareness stats`; `referenceNow` already exists.)

- [ ] **Step 5: Add help line**

In `printHelp`, after the `awareness memory show ...` line, add:

```text
  awareness memory stats [--since today|7d|30d|all] [--json] [--snapshot] [--home PATH]
```

- [ ] **Step 6: Run tests** — `npm test -- --test-name-pattern "memory stats"` then `npm test` — Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/memory-stats.js src/cli.js test/cli.test.js
git commit -m "Add memory stats command with efficiency scorecard"
```

---

### Task 7: Documentation, README, and templates

**Files:**
- Modify: `docs/cli.md`, `docs/memory.md`, `README.md`, `templates/agent-instructions.md`
- Test: `test/cli.test.js`

- [ ] **Step 1: Write docs smoke test**

```js
test('documentation mentions memory effectiveness metrics', () => {
  const cli = fs.readFileSync(path.join(repoRootForTests(), 'docs', 'cli.md'), 'utf8');
  const mem = fs.readFileSync(path.join(repoRootForTests(), 'docs', 'memory.md'), 'utf8');
  const tmpl = fs.readFileSync(path.join(repoRootForTests(), 'templates', 'agent-instructions.md'), 'utf8');
  assert.match(cli, /awareness memory stats/);
  assert.match(cli, /awareness memory used/);
  assert.match(mem, /Memory Efficiency|activation rate/i);
  assert.match(tmpl, /awareness memory used/);
});
```

- [ ] **Step 2: Run to verify it fails** — `npm test -- --test-name-pattern "documentation mentions memory effectiveness"` — Expected: FAIL.

- [ ] **Step 3: Update `docs/cli.md`** — In the `memory` section document `memory used` and `memory stats`, the three levels, the `curatedHits` field on recall events, and the `memory.used` event. Note that activation/utilization only reflect recalls recorded after v0.3.3+this feature (older recall events lack attribution).

- [ ] **Step 4: Update `docs/memory.md`** — Add a "Measuring Effectiveness" section describing the scorecard dimensions, the indicators per level, and how `memory used` closes the outcome loop. Stress that zero-result repeated queries are the gap signal.

- [ ] **Step 5: Update `README.md`** — Add `awareness memory stats` to the CLI quick start and mention `memory.used` in the private layout notes.

- [ ] **Step 6: Update `templates/agent-instructions.md`** — Add guidance:

```markdown
- After a recall meaningfully informs your work, credit it with `awareness memory used --text "<entry substring>" --note "<why>"`.
- Periodically review `awareness memory stats` (or `--json` for trends) and act on dead-weight entries and repeated zero-result gaps.
```

- [ ] **Step 7: Run tests** — `npm test -- --test-name-pattern "documentation mentions memory effectiveness"` then `npm test` — Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add docs/cli.md docs/memory.md README.md templates/agent-instructions.md test/cli.test.js
git commit -m "Document memory effectiveness metrics"
```

---

### Task 8: Final verification and PR

- [ ] **Step 1: Full suite** — `npm test` — Expected: PASS including the new tests:

```text
parseCuratedEntries extracts curated entries with stable keys
matching: synonyms, phrase boost, and conservative stemming
recall finds entries via synonym expansion
recall attributes hits to curated long-term entries
memory used credits a curated entry with a memory.used event
memory used accepts an exact --key override
memory used reports when no curated entry matches
collectMemoryMetrics computes funnel, activation, and scorecard
memory stats renders a scorecard and supports json + snapshot
memory stats rejects an invalid window
documentation mentions memory effectiveness metrics
```

- [ ] **Step 2: Smoke test against a temp home**

```bash
tmp_home="$(mktemp -d)"
node bin/awareness.js init --home "$tmp_home"
node bin/awareness.js memory promote --home "$tmp_home" --kind preference --text "Prefer ripgrep over grep" --evidence "smoke"
node bin/awareness.js recall --home "$tmp_home" "ripgrep"
node bin/awareness.js recall --home "$tmp_home" "missing-topic"
node bin/awareness.js recall --home "$tmp_home" "missing-topic"
node bin/awareness.js memory used --home "$tmp_home" --text "ripgrep" --note "smoke"
node bin/awareness.js memory stats --home "$tmp_home" --since all
```

Expected: scorecard prints; Activation > 0%; one repeated gap ("missing-topic"); useful-recall > 0%.

- [ ] **Step 3: Backward-compat check** — confirm `awareness memory stats` works against a home whose recall events predate `curatedHits` (older events simply contribute no activation). No crash.

- [ ] **Step 4: Open PR**

```bash
git push -u origin feature/memory-effectiveness-metrics
gh pr create --base main --head feature/memory-effectiveness-metrics \
  --title "Add memory effectiveness metrics" \
  --body-file <(printf '%s\n' \
    "## Summary" \
    "Measures whether stored memory is used and useful, not just whether it grows." \
    "- Entry-level recall attribution (curatedHits) + memory.used credit event." \
    "- New: awareness memory used, awareness memory stats (text/JSON/snapshot)." \
    "- Memory Efficiency Scorecard: Activation, Precision, Coverage, Pipeline, Freshness." \
    "- Pure aggregation in src/memory-metrics.js; rendering in src/memory-stats.js; cli.js stays thin." \
    "" \
    "## Validation" \
    "- npm test (new tests listed in plan)" \
    "- Temp-home smoke test for promote/recall/used/stats" \
    "" \
    "🤖 Generated with [Claude Code](https://claude.com/claude-code)")
```

- [ ] **Step 5: Report** PR URL, branch, commit list, test result, smoke result. Do not merge until the user approves. Release (version bump + tag + `npm publish` + local update) follows the repo's established process after merge.

---

## Self-Review

**Spec coverage:** Covers all indicators discussed — Level 1 store health (conversion, TTP, churn, source mix, density), Level 2 utilization (activation rate, dead weight, workhorses, recalls/session, hit rate, repeated zero-result gaps), Level 3 outcome (useful-recall rate, per-entry usage, contradictions), plus the composite 5-dimension scorecard and snapshotting.

**Instrumentation additions are minimal and backward compatible:** one new field (`curatedHits`) on recall events and one new event type (`memory.used`); old data degrades gracefully (no attribution → activation reflects only post-feature recalls).

**Matching stays local (no embeddings):** Task 2 now uses MiniSearch behind a small `src/search.js` wrapper, with `src/text.js` providing project-specific normalization and alias expansion. Embeddings and external services remain explicitly out of scope; memory never leaves the machine. The effectiveness metrics themselves (repeated zero-result gaps + hit rate) are the evidence that would later justify any separate opt-in semantic mode.

**Convention adherence:** Aggregation in `src/memory-metrics.js`, rendering in `src/memory-stats.js`, `src/cli.js` only routes — matching the `metrics.js`/`stats.js` split and the "do not grow cli.js" project memory. Reuses `windowBounds`/`withinWindow`/`parseJsonl`/`readRuntimeEvents` from `src/metrics.js`. Uses `toSorted` and `Object.hasOwn`-friendly patterns to stay SonarCloud-clean.

**Placeholder scan:** No `TBD`/`TODO`; each code-changing step has concrete code and exact files.

**Scope check:** No graph/vector/embeddings/services; MiniSearch is the only runtime dependency added for local indexing; private local state only; Markdown remains the readable projection.

**Open decisions for the implementer to confirm with the user:**
1. Surface as a separate `awareness memory stats` (this plan) vs. folding into the existing `awareness stats` Memory section. Plan chooses a separate command to keep the overview lean and the scorecard deep.
2. Scorecard thresholds (the 0/1/2 bands) are first-draft heuristics; tune after observing real data.
3. ~~`memory used` text-substring matching~~ — **resolved:** `memory used` reuses the shared MiniSearch wrapper for `--text`, with `--key` as an exact override. No embeddings. If real usage shows lexical search missing too much (tracked via the coverage metrics), a separate opt-in semantic mode can be specced then.
