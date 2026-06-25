// Rendering for `awareness stats`. Pure string builders so the CLI just writes
// the result. The metrics shape comes from src/metrics.js.
import { formatTriggerEfficiencyKpi } from './trigger-efficiency.js';

export function renderStatsJson(stats) {
  return JSON.stringify(stats, null, 2);
}

export function renderStatsText(stats) {
  const window = stats.window.from
    ? `${stats.window.from} -> ${stats.window.to}`
    : `all time (through ${stats.window.to})`;

  return [
    `Awareness Stats (${stats.window.since}: ${window})`,
    '',
    'Sessions & Hooks',
    `- Sessions started: ${stats.hooks.sessions}`,
    `- Hook events: ${stats.hooks.total}`,
    `- Compactions: ${stats.hooks.compactions}`,
    `- By tool: ${formatCounts(stats.hooks.byTool)}`,
    '',
    'Scheduled Runs',
    `- Total: ${stats.schedule.total}`,
    `- By cadence: ${formatCounts(stats.schedule.byCadence)}`,
    `- Warnings (latest/max over ${stats.warnings.samples} samples): ${stats.warnings.latest}/${stats.warnings.max}`,
    '',
    'Memory',
    `- Candidates created: ${stats.memory.candidatesCreated} (${formatCounts(stats.memory.candidatesBySource)})`,
    `- Promoted: ${stats.memory.promoted} (${formatCounts(stats.memory.promotedByKind)})`,
    `- Pruned: ${stats.memory.pruned}`,
    `- Pattern suggestions: ${stats.memory.patternsSuggested}`,
    '',
    'Private Templates',
    `- Status: ${formatTemplateStatus(stats.privateTemplates)}`,
    ...formatPendingTemplateFiles(stats.privateTemplates),
    '',
    'Recall (hits)',
    `- Calls: ${stats.recall.calls}`,
    `- Avg results/call: ${stats.recall.avgResults.toFixed(1)}`,
    `- Zero-result queries: ${stats.recall.zeroResultQueries}`,
    `- Top queries: ${formatRanked(stats.recall.topQueries)}`,
    `- Top files: ${formatRanked(stats.recall.topFiles)}`,
    '',
    'Memory Trigger',
    `- Calls: ${stats.memoryTrigger.calls}`,
    `- Injected/skipped: ${stats.memoryTrigger.injected}/${stats.memoryTrigger.skipped}`,
    `- By phase: ${formatCounts(stats.memoryTrigger.byPhase)}`,
    `- By provider: ${formatCounts(stats.memoryTrigger.byProvider)}`,
    `- Efficiency KPI: ${formatTriggerEfficiencyKpi(stats.memoryTrigger.efficiencyKpi)}`,
    `- Avg injected tokens: ${stats.memoryTrigger.avgInjectedTokens.toFixed(1)}`,
    `- P95 injected tokens: ${stats.memoryTrigger.p95InjectedTokens}`,
    `- Total injected tokens: ${stats.memoryTrigger.totalInjectedTokens}`,
    `- Avg internal tokens: ${stats.memoryTrigger.avgInternalTokens.toFixed(1)}`,
    `- Avg context overhead: ${(stats.memoryTrigger.avgContextOverheadPct * 100).toFixed(2)}%`,
    `- Max context overhead: ${(stats.memoryTrigger.maxContextOverheadPct * 100).toFixed(2)}%`,
    '',
    'Activity',
    `- Worklog entries: ${stats.activity.worklogEntries} over ${stats.activity.days} day(s)`,
    `- Distinct tasks: ${stats.activity.distinctTasks}`,
    `- Distinct repos: ${stats.activity.distinctRepos}`,
    '',
    'Storage',
    ...stats.storage.byArea.map((entry) => `- ${entry.area}: ${entry.files} file(s), ${formatBytes(entry.bytes)}`),
    `- Total: ${stats.storage.totalFiles} file(s), ${formatBytes(stats.storage.totalBytes)}`,
  ].join('\n');
}

function formatCounts(counts) {
  const entries = Object.entries(counts);
  if (!entries.length) return 'none';
  return entries
    .toSorted((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([name, count]) => `${name}=${count}`)
    .join(', ');
}

function formatRanked(ranked) {
  if (!ranked.length) return 'none';
  return ranked.map((entry) => `${entry.name} (${entry.count})`).join(', ');
}

function formatTemplateStatus(privateTemplates) {
  if (!privateTemplates) return 'unknown';
  return privateTemplates.status === 'up-to-date' ? 'up-to-date' : 'updates available';
}

function formatPendingTemplateFiles(privateTemplates) {
  if (!privateTemplates?.pendingFiles?.length) return ['- Pending files: none'];
  return privateTemplates.pendingFiles.map((entry) => `- ${entry.file}: ${entry.actions.join(', ')}`);
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}
