export function renderMemoryStatsJson(metrics) {
  return JSON.stringify(metrics, null, 2);
}

export function renderMemoryStatsText(metrics) {
  const window = metrics.window.from
    ? `${metrics.window.from} -> ${metrics.window.to}`
    : `all time (through ${metrics.window.to})`;

  return [
    `Memory Efficiency (${metrics.window.since}: ${window})`,
    '',
    'Scorecard',
    ...metrics.scorecard.dimensions.map((dimension) => (
      `- ${dimension.name}: ${dimension.score}/2 (${dimension.evidence})`
    )),
    `- Total: ${metrics.scorecard.total}/${metrics.scorecard.max}`,
    '',
    'Store Health',
    `- Candidates created: ${metrics.store.candidatesCreated} (${formatCounts(metrics.store.candidatesBySource)})`,
    `- Promoted: ${metrics.store.promoted} (${formatCounts(metrics.store.promotedByKind)})`,
    `- Pruned: ${metrics.store.pruned}`,
    `- Conversion: ${formatPercent(metrics.store.conversionRate)}`,
    `- Churn: ${formatPercent(metrics.store.churnRate)}`,
    `- Growth vs prune: +${metrics.store.growthVsPrune.added} / -${metrics.store.growthVsPrune.pruned} / net ${metrics.store.growthVsPrune.net}`,
    `- Section density: ${formatCounts(metrics.store.sectionDensity)}`,
    `- Promotion source mix: ${formatCounts(metrics.store.sourceMix)}`,
    '',
    'Pipeline',
    `- Median time-to-promotion: ${formatDays(metrics.pipeline.medianTimeToPromotionDays)}`,
    `- Avg time-to-promotion: ${formatDays(metrics.pipeline.avgTimeToPromotionDays)}`,
    '',
    'Utilization',
    `- Activation: ${formatPercent(metrics.utilization.activationRate)} (${metrics.utilization.curatedRecalled}/${metrics.utilization.curatedTotal} entries recalled)`,
    `- Recalls/session: ${formatNumber(metrics.utilization.recallsPerSession)}`,
    `- Workhorses: ${formatWorkhorses(metrics.utilization.workhorses)}`,
    `- Dead weight: ${metrics.utilization.deadWeight.length}`,
    `- Time-to-first-recall median/avg: ${formatDays(metrics.utilization.timeToFirstRecallDays.median)} / ${formatDays(metrics.utilization.timeToFirstRecallDays.avg)}`,
    '',
    'Coverage',
    `- Calls: ${metrics.coverage.calls}`,
    `- Hit rate: ${formatPercent(metrics.coverage.hitRate)}`,
    `- Avg results/call: ${formatNumber(metrics.coverage.avgResults)}`,
    `- Zero-result queries: ${metrics.coverage.zeroResultQueries}`,
    `- Repeated zero-result queries: ${formatRepeatedGaps(metrics.coverage.repeatedZeroResultQueries)}`,
    '',
    'Outcome',
    `- Useful-recall rate: ${formatPercent(metrics.outcome.usefulRecallRate)}`,
    `- Used events: ${metrics.outcome.usedEvents}`,
    `- Distinct entries used: ${metrics.outcome.distinctEntriesUsed}`,
    `- Per-entry usefulness: ${formatCounts(metrics.outcome.perEntryUsefulness)}`,
    `- Contradictions: ${metrics.outcome.contradictions.length}`,
  ].join('\n');
}

function formatCounts(counts) {
  const entries = Object.entries(counts || {});
  if (!entries.length) return 'none';
  return entries
    .toSorted((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([name, count]) => `${name}=${count}`)
    .join(', ');
}

function formatWorkhorses(entries) {
  if (!entries.length) return 'none';
  return entries.map((entry) => `${truncate(entry.text)} (${entry.recalls})`).join(', ');
}

function formatRepeatedGaps(gaps) {
  if (!gaps.length) return 'none';
  return gaps.map((gap) => `"${gap.query}" (${gap.count})`).join(', ');
}

function formatPercent(value) {
  return `${Math.round((value || 0) * 100)}%`;
}

function formatNumber(value) {
  return Number(value || 0).toFixed(2);
}

function formatDays(value) {
  return value === null || value === undefined ? 'n/a' : `${value.toFixed(1)}d`;
}

function truncate(text, length = 48) {
  const value = String(text || '');
  return value.length > length ? `${value.slice(0, length - 3)}...` : value;
}
