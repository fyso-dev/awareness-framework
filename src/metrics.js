import fs from 'node:fs';
import path from 'node:path';

// Pure-ish metrics aggregation over the private state that the CLI already
// records. Keeps src/cli.js thin: cli.js only wires the command and passes a
// reference date; all parsing/aggregation lives here so it can be tested
// without spawning the CLI.

const WINDOWS = {
  today: 0,
  '7d': 6,
  '30d': 29,
  all: null,
};

export function isValidWindow(since) {
  return Object.prototype.hasOwnProperty.call(WINDOWS, since);
}

export function windowBounds(referenceDate, since) {
  const to = dateString(referenceDate);
  if (since === 'all') return { since, from: null, to };
  const days = WINDOWS[since];
  const start = new Date(referenceDate.getTime());
  start.setDate(start.getDate() - days);
  return { since, from: dateString(start), to };
}

export function parseJsonl(content) {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

// Read every YYYY-MM-DD.jsonl file under runtime/<category> whose filename date
// falls within [from, to]. Filename-based filtering keeps this cheap; the
// per-record timestamp is still available for callers that need finer detail.
export function readRuntimeEvents(home, category, bounds) {
  const dir = path.join(home, 'runtime', category);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(name))
    .filter((name) => withinWindow(name.slice(0, 10), bounds))
    .sort()
    .flatMap((name) => parseJsonl(fs.readFileSync(path.join(dir, name), 'utf8')));
}

export function withinWindow(dateStr, bounds) {
  if (!bounds || bounds.from === null) return true;
  return dateStr >= bounds.from && dateStr <= bounds.to;
}

export function tallyBy(items, key) {
  const counts = {};
  for (const item of items) {
    const value = typeof key === 'function' ? key(item) : item[key];
    if (value === undefined || value === null) continue;
    counts[value] = (counts[value] || 0) + 1;
  }
  return counts;
}

export function summarizeHooks(events) {
  return {
    total: events.length,
    byTool: tallyBy(events, 'tool'),
    byEvent: tallyBy(events, 'event'),
    sessions: events.filter((event) => event.event === 'session-start').length,
    compactions: events.filter((event) => event.event === 'pre-compact' || event.event === 'post-compact').length,
  };
}

export function summarizeSchedule(events) {
  return {
    total: events.length,
    byCadence: tallyBy(events, 'cadence'),
  };
}

export function summarizeWarnings(events) {
  const samples = events
    .map((event) => Number(event.warnings))
    .filter((value) => Number.isFinite(value));
  if (!samples.length) return { samples: 0, max: 0, latest: 0 };
  return {
    samples: samples.length,
    max: Math.max(...samples),
    latest: samples[samples.length - 1],
  };
}

export function summarizeMemory(events, bounds) {
  const scoped = events.filter((event) => withinWindow(eventDate(event), bounds));
  const candidates = scoped.filter((event) => event.type === 'memory.candidate.created');
  const promoted = scoped.filter((event) => event.type === 'memory.promoted');
  const pruned = scoped.filter((event) => event.type === 'memory.pruned');
  const patterns = scoped.filter((event) => event.type === 'pattern.suggested');
  const candidateCount = candidates.length;
  return {
    candidatesCreated: candidateCount,
    candidatesBySource: tallyBy(candidates, 'source'),
    promoted: promoted.length,
    promotedByKind: tallyBy(promoted, 'kind'),
    pruned: pruned.length,
    patternsSuggested: patterns.length,
    conversionRate: candidateCount ? promoted.length / candidateCount : 0,
  };
}

export function summarizeRecall(events) {
  const calls = events.filter((event) => event.source === 'recall');
  const totalResults = calls.reduce((sum, event) => sum + (Number(event.resultCount) || 0), 0);
  const zeroResultQueries = calls.filter((event) => Number(event.resultCount) === 0).length;
  const topQueries = topEntries(tallyBy(calls, 'query'), 5);
  const topFiles = topEntries(countFileHits(calls), 5);
  return {
    calls: calls.length,
    totalResults,
    avgResults: calls.length ? totalResults / calls.length : 0,
    zeroResultQueries,
    topQueries,
    topFiles,
  };
}

function countFileHits(calls) {
  const counts = {};
  for (const call of calls) {
    if (!Array.isArray(call.topFiles)) continue;
    for (const file of call.topFiles) {
      counts[file] = (counts[file] || 0) + 1;
    }
  }
  return counts;
}

export function topEntries(counts, limit) {
  return Object.entries(counts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

// Worklog activity within the window, parsed from the daily markdown files.
export function summarizeActivity(home, bounds) {
  const dir = path.join(home, 'worklog');
  if (!fs.existsSync(dir)) {
    return { worklogEntries: 0, distinctTasks: 0, distinctRepos: 0, days: 0 };
  }
  const files = fs.readdirSync(dir)
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name))
    .filter((name) => withinWindow(name.slice(0, 10), bounds));

  let entries = 0;
  const tasks = new Set();
  const repos = new Set();
  for (const name of files) {
    const content = fs.readFileSync(path.join(dir, name), 'utf8');
    for (const block of worklogBlocks(content)) {
      entries += 1;
      const task = worklogField(block, 'Jira') || headingTask(block);
      if (task && task !== 'Unassigned') tasks.add(task);
      const repo = worklogField(block, 'Repo') || worklogField(block, 'Repository');
      if (repo && repo !== 'Not specified') repos.add(repo);
    }
  }

  return {
    worklogEntries: entries,
    distinctTasks: tasks.size,
    distinctRepos: repos.size,
    days: files.length,
  };
}

function worklogBlocks(content) {
  const headings = [...content.matchAll(/^#{2,3} \d{2}:\d{2} - .+$/gm)];
  return headings.map((heading, index) => {
    const start = heading.index;
    const end = index + 1 < headings.length ? headings[index + 1].index : content.length;
    return content.slice(start, end);
  });
}

function worklogField(block, key) {
  const line = block.split('\n').find((candidate) => candidate.trim().startsWith(`- ${key}:`));
  return line ? line.slice(line.indexOf(':') + 1).trim() : null;
}

function headingTask(block) {
  const heading = block.split('\n')[0] || '';
  const rest = heading.replace(/^#{2,3} \d{2}:\d{2} - /, '');
  const candidate = rest.split(' - ')[0];
  return /^[A-Z][A-Z0-9]+-\d+$/.test(candidate) ? candidate : null;
}

// On-demand storage footprint, grouped by the top-level area folders.
export function summarizeStorage(home) {
  const areas = ['awareness', 'worklog', 'memory', 'evaluations', 'runtime'];
  const byArea = areas.map((area) => ({ area, ...directorySize(path.join(home, area)) }));
  return {
    byArea,
    totalFiles: byArea.reduce((sum, entry) => sum + entry.files, 0),
    totalBytes: byArea.reduce((sum, entry) => sum + entry.bytes, 0),
  };
}

function directorySize(dir) {
  if (!fs.existsSync(dir)) return { files: 0, bytes: 0 };
  let files = 0;
  let bytes = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = directorySize(full);
      files += nested.files;
      bytes += nested.bytes;
    } else if (entry.isFile()) {
      files += 1;
      bytes += fs.statSync(full).size;
    }
  }
  return { files, bytes };
}

function eventDate(event) {
  return typeof event.timestamp === 'string' ? event.timestamp.slice(0, 10) : '';
}

function dateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function collectStats(home, referenceDate, since = '7d') {
  const bounds = windowBounds(referenceDate, since);
  const memoryEvents = readMemoryEvents(home);
  return {
    window: bounds,
    hooks: summarizeHooks(readRuntimeEvents(home, 'hooks', bounds)),
    schedule: summarizeSchedule(readRuntimeEvents(home, 'schedule', bounds)),
    warnings: summarizeWarnings([
      ...readRuntimeEvents(home, 'hooks', bounds),
      ...readRuntimeEvents(home, 'schedule', bounds),
    ]),
    memory: summarizeMemory(memoryEvents, bounds),
    recall: summarizeRecall(readRuntimeEvents(home, 'recall', bounds)),
    activity: summarizeActivity(home, bounds),
    storage: summarizeStorage(home),
  };
}

function readMemoryEvents(home) {
  const file = path.join(home, 'memory', 'events.jsonl');
  if (!fs.existsSync(file)) return [];
  return parseJsonl(fs.readFileSync(file, 'utf8'));
}
