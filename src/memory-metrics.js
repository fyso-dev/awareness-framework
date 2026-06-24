import fs from 'node:fs';
import path from 'node:path';
import { windowBounds, withinWindow, parseJsonl, readRuntimeEvents } from './metrics.js';

const CURATED_SECTIONS = new Set(['Preferences', 'Patterns', 'Project Conventions', 'Review Guidance']);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function normalizeEntryText(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function entryKey(text) {
  const normalized = normalizeEntryText(text);
  let hash = 5381;
  for (const char of normalized) {
    hash = ((hash * 33) ^ char.codePointAt(0)) >>> 0;
  }
  return hash.toString(36);
}

export function parseCuratedEntries(content) {
  const entries = [];
  const lines = String(content || '').split('\n');
  let section = null;

  lines.forEach((line, index) => {
    if (line.startsWith('## ')) {
      const candidate = line.slice(3).trim();
      section = CURATED_SECTIONS.has(candidate) ? candidate : null;
      return;
    }

    if (!section) return;
    const parsedLine = parseEntryLine(line);
    if (!parsedLine) return;

    const { text, evidence } = splitEntryBody(parsedLine.body);
    if (!text || isPlaceholder(text)) return;

    entries.push({
      section,
      date: parsedLine.date,
      text,
      evidence,
      key: entryKey(text),
      lineStart: index + 1,
      lineEnd: index + 1,
    });
  });

  return entries;
}

export function curatedHitsForResults(longTermContent, results, longTermPath) {
  const entries = parseCuratedEntries(longTermContent);
  const target = normalizePath(longTermPath);
  const hits = new Set();

  for (const result of Array.isArray(results) ? results : []) {
    if (normalizePath(result.file) !== target) continue;
    const line = Number(result.line);
    if (!Number.isFinite(line)) continue;
    const entry = entries.find((candidate) => line >= candidate.lineStart && line <= candidate.lineEnd);
    if (entry) hits.add(entry.key);
  }

  return [...hits];
}

export function collectMemoryMetrics(home, referenceDate, since = '7d') {
  const bounds = windowBounds(referenceDate, since);
  const allEvents = readMemoryEvents(home);
  const events = allEvents.filter((event) => withinWindow(eventDate(event), bounds));
  const recalls = readRuntimeEvents(home, 'recall', bounds)
    .filter((event) => event.source === 'recall')
    .filter((event) => withinWindow(eventDate(event), bounds));
  const sessions = readRuntimeEvents(home, 'hooks', bounds)
    .filter((event) => event.event === 'session-start')
    .filter((event) => withinWindow(eventDate(event), bounds))
    .length;
  const entries = parseCuratedEntries(readLongTerm(home));

  const store = summarizeStore(events, entries, allEvents, bounds);
  const utilization = summarizeUtilization(entries, recalls, sessions, allEvents);
  const coverage = summarizeCoverage(recalls);
  const outcome = summarizeOutcome(events, entries, recalls);
  const pipeline = summarizePipeline(events, allEvents, store);
  const scorecard = buildScorecard({ utilization, coverage, outcome, pipeline });

  return {
    window: bounds,
    store,
    utilization,
    coverage,
    outcome,
    pipeline,
    scorecard,
  };
}

function summarizeStore(events, entries, allEvents, bounds) {
  const candidates = events.filter((event) => event.type === 'memory.candidate.created');
  const promoted = events.filter((event) => event.type === 'memory.promoted');
  const pruned = events.filter((event) => event.type === 'memory.pruned');
  const patterns = events.filter((event) => event.type === 'pattern.suggested');
  const sourceMix = promotionSourceMix(promoted, allEvents);
  const sectionDensity = countBy(entries, 'section');

  return {
    candidatesCreated: candidates.length,
    candidatesBySource: countBy(candidates, 'source'),
    promoted: promoted.length,
    promotedByKind: countBy(promoted, 'kind'),
    pruned: pruned.length,
    patternsSuggested: patterns.length,
    conversionRate: candidates.length ? promoted.length / candidates.length : 0,
    conversionCaveat: bounds.from === null
      ? ''
      : 'Window-scoped candidates and promotions may have cross-window pairs.',
    churnRate: promoted.length ? pruned.length / promoted.length : 0,
    growthVsPrune: {
      added: promoted.length,
      pruned: pruned.length,
      net: promoted.length - pruned.length,
    },
    sectionDensity,
    sourceMix,
  };
}

function summarizeUtilization(entries, recalls, sessions, allEvents) {
  const entryByKey = new Map(entries.map((entry) => [entry.key, entry]));
  const recalledKeys = new Set();
  const hitCounts = {};
  const firstRecallByKey = {};

  for (const recall of recalls) {
    for (const key of recallCuratedHits(recall)) {
      if (!entryByKey.has(key)) continue;
      recalledKeys.add(key);
      hitCounts[key] = (hitCounts[key] || 0) + 1;
      const timestamp = toEpoch(recall.timestamp);
      if (timestamp === null) continue;
      if (firstRecallByKey[key] === undefined || timestamp < firstRecallByKey[key]) {
        firstRecallByKey[key] = timestamp;
      }
    }
  }

  const timeToFirstRecall = timeToFirstRecallDays(entries, allEvents, firstRecallByKey);
  const curatedRecalled = recalledKeys.size;

  return {
    curatedTotal: entries.length,
    curatedRecalled,
    activationRate: entries.length ? curatedRecalled / entries.length : 0,
    deadWeight: entries
      .filter((entry) => !recalledKeys.has(entry.key))
      .map((entry) => entrySummary(entry)),
    workhorses: entries
      .map((entry) => ({ ...entrySummary(entry), recalls: hitCounts[entry.key] || 0 }))
      .filter((entry) => entry.recalls > 0)
      .sort((left, right) => right.recalls - left.recalls || left.text.localeCompare(right.text))
      .slice(0, 5),
    hitCounts,
    recallsPerSession: sessions ? recalls.length / sessions : 0,
    timeToFirstRecallDays: timeToFirstRecall,
  };
}

function summarizeCoverage(recalls) {
  const totalResults = recalls.reduce((sum, recall) => sum + (Number(recall.resultCount) || 0), 0);
  const zero = recalls.filter((recall) => Number(recall.resultCount) === 0);
  const repeatedZeroResultQueries = Object.entries(countQueries(zero))
    .filter(([, count]) => count >= 2)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([query, count]) => ({ query, count }));

  return {
    calls: recalls.length,
    totalResults,
    avgResults: recalls.length ? totalResults / recalls.length : 0,
    hitRate: recalls.length ? (recalls.length - zero.length) / recalls.length : 0,
    zeroResultQueries: zero.length,
    repeatedZeroResultQueries,
  };
}

function summarizeOutcome(events, entries, recalls) {
  const used = events.filter((event) => event.type === 'memory.used');
  const entryByKey = new Map(entries.map((entry) => [entry.key, entry]));
  const usedKeys = new Set(used.map((event) => event.key || entryKey(event.text || '')).filter(Boolean));
  const recalledKeys = new Set(
    recalls
      .flatMap((recall) => recallCuratedHits(recall))
      .filter((key) => entryByKey.has(key)),
  );
  const usefulKeys = [...usedKeys].filter((key) => recalledKeys.has(key));
  const perEntryUsefulness = {};

  for (const event of used) {
    const key = event.key || entryKey(event.text || '');
    const entry = entryByKey.get(key);
    const label = entry ? entry.text : (event.text || key);
    perEntryUsefulness[label] = (perEntryUsefulness[label] || 0) + 1;
  }

  return {
    usedEvents: used.length,
    distinctEntriesUsed: usedKeys.size,
    usefulRecallRate: recalledKeys.size ? usefulKeys.length / recalledKeys.size : 0,
    perEntryUsefulness,
    contradictions: contradictions(events),
  };
}

function summarizePipeline(events, allEvents, store) {
  const timeToPromotion = timeToPromotionDays(events, allEvents);

  return {
    conversionRate: store.conversionRate,
    churnRate: store.churnRate,
    medianTimeToPromotionDays: median(timeToPromotion),
    avgTimeToPromotionDays: average(timeToPromotion),
    sourceMix: store.sourceMix,
  };
}

function buildScorecard({ utilization, coverage, outcome, pipeline }) {
  const dimensions = [
    scoreDimension(
      'Activation',
      activationScore(utilization),
      `${percent(utilization.activationRate)} of ${utilization.curatedTotal} curated entries recalled`,
    ),
    scoreDimension(
      'Precision',
      precisionScore(coverage, outcome),
      `avg results ${coverage.avgResults.toFixed(1)}, useful-recall ${percent(outcome.usefulRecallRate)}`,
    ),
    scoreDimension(
      'Coverage',
      coverageScore(coverage),
      `hit rate ${percent(coverage.hitRate)}, ${coverage.repeatedZeroResultQueries.length} repeated gap(s)`,
    ),
    scoreDimension(
      'Pipeline',
      pipelineScore(pipeline),
      `conversion ${percent(pipeline.conversionRate)}, churn ${percent(pipeline.churnRate)}, median TTP ${formatDays(pipeline.medianTimeToPromotionDays)}`,
    ),
    scoreDimension(
      'Freshness',
      freshnessScore(utilization, outcome),
      `${utilization.curatedRecalled}/${utilization.curatedTotal} recalled, ${outcome.distinctEntriesUsed} used, ${outcome.contradictions.length} contradiction(s)`,
    ),
  ];

  return {
    dimensions,
    total: dimensions.reduce((sum, dimension) => sum + dimension.score, 0),
    max: dimensions.length * 2,
  };
}

function splitEntryBody(body) {
  const marker = ' (evidence:';
  if (!body.endsWith(')')) return { text: body.trim(), evidence: '' };
  const markerIndex = body.lastIndexOf(marker);
  if (markerIndex === -1) return { text: body.trim(), evidence: '' };
  return {
    text: body.slice(0, markerIndex).trim(),
    evidence: body.slice(markerIndex + marker.length, -1).trim(),
  };
}

function parseEntryLine(line) {
  if (!line.startsWith('- ')) return null;
  const rest = line.slice(2);
  const date = rest.slice(0, 10);
  if (!isDateStamp(date) || rest.slice(10, 12) !== ': ') return null;
  return { date, body: rest.slice(12) };
}

function isDateStamp(value) {
  return value.length === 10
    && value[4] === '-'
    && value[7] === '-'
    && digitsOnly(value.slice(0, 4))
    && digitsOnly(value.slice(5, 7))
    && digitsOnly(value.slice(8, 10));
}

function digitsOnly(value) {
  for (const char of value) {
    if (char < '0' || char > '9') return false;
  }
  return true;
}

function isPlaceholder(text) {
  return /^none(?: yet)?\.?$/i.test(text.trim());
}

function normalizePath(value) {
  if (!value) return '';
  return path.resolve(String(value));
}

function recallCuratedHits(recall) {
  return Array.isArray(recall.curatedHits) ? recall.curatedHits.filter(Boolean) : [];
}

function entrySummary(entry) {
  return {
    key: entry.key,
    section: entry.section,
    text: entry.text,
  };
}

function promotionSourceMix(promoted, allEvents) {
  const candidates = allEvents
    .filter((event) => event.type === 'memory.candidate.created')
    .sort((left, right) => String(left.timestamp || '').localeCompare(String(right.timestamp || '')));
  const counts = {};

  for (const promotion of promoted) {
    const source = candidateSourceForPromotion(promotion, candidates);
    counts[source] = (counts[source] || 0) + 1;
  }

  return counts;
}

function candidateSourceForPromotion(promotion, candidates) {
  const text = normalizeEntryText(promotion.text || '');
  const promotionTime = String(promotion.timestamp || '');
  const match = candidates
    .findLast((candidate) => normalizeEntryText(candidate.text || '') === text
      && (!promotionTime || String(candidate.timestamp || '') <= promotionTime));
  return match?.source || 'direct';
}

function timeToPromotionDays(events, allEvents) {
  const candidates = allEvents
    .filter((event) => event.type === 'memory.candidate.created')
    .sort((left, right) => String(left.timestamp || '').localeCompare(String(right.timestamp || '')));
  const promoted = events.filter((event) => event.type === 'memory.promoted');
  const deltas = [];

  for (const promotion of promoted) {
    const promotionTime = toEpoch(promotion.timestamp);
    if (promotionTime === null) continue;
    const text = normalizeEntryText(promotion.text || '');
    const match = candidates.findLast((candidate) => {
      if (normalizeEntryText(candidate.text || '') !== text) {
        return false;
      }
      const candidateTime = toEpoch(candidate.timestamp);
      return candidateTime !== null && candidateTime <= promotionTime;
    });
    if (!match) continue;
    deltas.push((promotionTime - toEpoch(match.timestamp)) / MS_PER_DAY);
  }

  return deltas;
}

function timeToFirstRecallDays(entries, allEvents, firstRecallByKey) {
  const promotedTimes = promotedTimesByKey(allEvents);
  const deltas = entries
    .map((entry) => {
      const promotedTime = promotedTimes[entry.key] ?? dateToEpoch(entry.date);
      const recallTime = firstRecallByKey[entry.key];
      if (promotedTime === null || promotedTime === undefined || recallTime === undefined) return null;
      return (recallTime - promotedTime) / MS_PER_DAY;
    })
    .filter((value) => value !== null && Number.isFinite(value) && value >= 0);

  return {
    median: median(deltas),
    avg: average(deltas),
    entries: deltas.length,
  };
}

function promotedTimesByKey(allEvents) {
  const out = {};
  for (const event of allEvents.filter((candidate) => candidate.type === 'memory.promoted')) {
    const key = entryKey(event.text || '');
    const timestamp = toEpoch(event.timestamp);
    if (timestamp === null) continue;
    if (out[key] === undefined || timestamp < out[key]) out[key] = timestamp;
  }
  return out;
}

function contradictions(events) {
  const pruned = events.filter((event) => event.type === 'memory.pruned');
  const readded = events.filter((event) => (
    event.type === 'memory.candidate.created' || event.type === 'memory.promoted'
  ));
  const rows = [];

  for (const prune of pruned) {
    const text = normalizeEntryText(prune.text || '');
    const pruneTime = String(prune.timestamp || '');
    if (!text) continue;
    const match = readded.find((event) => (
      normalizeEntryText(event.text || '') === text
      && (!pruneTime || String(event.timestamp || '') > pruneTime)
    ));
    if (match) rows.push({ text: prune.text || match.text || '', prunedAt: prune.timestamp, readdedAt: match.timestamp });
  }

  return rows;
}

function countBy(items, key) {
  const counts = {};
  for (const item of items) {
    const value = item[key];
    if (value === undefined || value === null || value === '') continue;
    counts[value] = (counts[value] || 0) + 1;
  }
  return counts;
}

function countQueries(recalls) {
  const counts = {};
  for (const recall of recalls) {
    const query = normalizeEntryText(recall.query || '');
    if (!query) continue;
    counts[query] = (counts[query] || 0) + 1;
  }
  return counts;
}

function readMemoryEvents(home) {
  const file = path.join(home, 'memory', 'events.jsonl');
  return fs.existsSync(file) ? parseJsonl(fs.readFileSync(file, 'utf8')) : [];
}

function readLongTerm(home) {
  const file = path.join(home, 'memory', 'long-term.md');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

function eventDate(event) {
  return typeof event.timestamp === 'string' ? event.timestamp.slice(0, 10) : '';
}

function toEpoch(timestamp) {
  if (!timestamp) return null;
  const parsed = new Date(timestamp);
  const time = parsed.getTime();
  return Number.isNaN(time) ? null : time;
}

function dateToEpoch(date) {
  if (!date) return null;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  const time = parsed.getTime();
  return Number.isNaN(time) ? null : time;
}

function median(values) {
  const sorted = values.filter(Number.isFinite).toSorted((left, right) => left - right);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function average(values) {
  const filtered = values.filter(Number.isFinite);
  return filtered.length ? filtered.reduce((sum, value) => sum + value, 0) / filtered.length : null;
}

function scoreDimension(name, score, evidence) {
  return { name, score, evidence };
}

function activationScore(utilization) {
  if (utilization.activationRate >= 0.6) return 2;
  return utilization.activationRate > 0 ? 1 : 0;
}

function precisionScore(coverage, outcome) {
  const useful = outcome.usefulRecallRate >= 0.5;
  const boundedResults = coverage.avgResults >= 1 && coverage.avgResults <= 8;
  if (boundedResults && useful) return 2;
  if (boundedResults || outcome.usedEvents > 0) return 1;
  return 0;
}

function coverageScore(coverage) {
  if (coverage.hitRate >= 0.8 && coverage.repeatedZeroResultQueries.length === 0) return 2;
  return coverage.hitRate >= 0.5 ? 1 : 0;
}

function pipelineScore(pipeline) {
  const ttp = pipeline.medianTimeToPromotionDays;
  if (pipeline.conversionRate >= 0.3 && pipeline.conversionRate <= 1 && pipeline.churnRate < 0.2 && (ttp === null || ttp <= 3)) {
    return 2;
  }
  if (pipeline.conversionRate > 0 && pipeline.churnRate < 0.5) return 1;
  return 0;
}

function freshnessScore(utilization, outcome) {
  const active = utilization.curatedTotal
    ? (utilization.curatedRecalled + outcome.distinctEntriesUsed) / utilization.curatedTotal
    : 0;
  if (active >= 0.6 && outcome.contradictions.length === 0) return 2;
  if (active > 0 && outcome.contradictions.length === 0) return 1;
  return 0;
}

function percent(value) {
  return `${Math.round((value || 0) * 100)}%`;
}

function formatDays(value) {
  return value === null || value === undefined ? 'n/a' : `${value.toFixed(1)}d`;
}
