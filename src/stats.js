// Rendering for `awareness stats`. Pure string builders so the CLI just writes
// the result. The metrics shape comes from src/metrics.js.

export function renderStatsJson(stats) {
  return JSON.stringify(stats, null, 2);
}

export function renderStatsText(stats) {
  const lines = [];
  const window = stats.window.from
    ? `${stats.window.from} -> ${stats.window.to}`
    : `all time (through ${stats.window.to})`;
  lines.push(`Awareness Stats (${stats.window.since}: ${window})`);

  lines.push('');
  lines.push('Sessions & Hooks');
  lines.push(`- Sessions started: ${stats.hooks.sessions}`);
  lines.push(`- Hook events: ${stats.hooks.total}`);
  lines.push(`- Compactions: ${stats.hooks.compactions}`);
  lines.push(`- By tool: ${formatCounts(stats.hooks.byTool)}`);

  lines.push('');
  lines.push('Scheduled Runs');
  lines.push(`- Total: ${stats.schedule.total}`);
  lines.push(`- By cadence: ${formatCounts(stats.schedule.byCadence)}`);
  lines.push(`- Warnings (latest/max over ${stats.warnings.samples} samples): ${stats.warnings.latest}/${stats.warnings.max}`);

  lines.push('');
  lines.push('Memory');
  lines.push(`- Candidates created: ${stats.memory.candidatesCreated} (${formatCounts(stats.memory.candidatesBySource)})`);
  lines.push(`- Promoted: ${stats.memory.promoted} (${formatCounts(stats.memory.promotedByKind)})`);
  lines.push(`- Pruned: ${stats.memory.pruned}`);
  lines.push(`- Pattern suggestions: ${stats.memory.patternsSuggested}`);

  lines.push('');
  lines.push('Recall (hits)');
  lines.push(`- Calls: ${stats.recall.calls}`);
  lines.push(`- Avg results/call: ${stats.recall.avgResults.toFixed(1)}`);
  lines.push(`- Zero-result queries: ${stats.recall.zeroResultQueries}`);
  lines.push(`- Top queries: ${formatRanked(stats.recall.topQueries)}`);
  lines.push(`- Top files: ${formatRanked(stats.recall.topFiles)}`);

  lines.push('');
  lines.push('Activity');
  lines.push(`- Worklog entries: ${stats.activity.worklogEntries} over ${stats.activity.days} day(s)`);
  lines.push(`- Distinct tasks: ${stats.activity.distinctTasks}`);
  lines.push(`- Distinct repos: ${stats.activity.distinctRepos}`);

  lines.push('');
  lines.push('Storage');
  for (const entry of stats.storage.byArea) {
    lines.push(`- ${entry.area}: ${entry.files} file(s), ${formatBytes(entry.bytes)}`);
  }
  lines.push(`- Total: ${stats.storage.totalFiles} file(s), ${formatBytes(stats.storage.totalBytes)}`);

  return lines.join('\n');
}

function formatCounts(counts) {
  const entries = Object.entries(counts);
  if (!entries.length) return 'none';
  return entries
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([name, count]) => `${name}=${count}`)
    .join(', ');
}

function formatRanked(ranked) {
  if (!ranked.length) return 'none';
  return ranked.map((entry) => `${entry.name} (${entry.count})`).join(', ');
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
