export function triggerEfficiencyKpi({ calls, injected, usedEvents, totalOverheadTokens, avgContextOverheadPct }) {
  const creditedUses = Math.max(0, Number(usedEvents) || 0);
  const injectionRate = calls ? injected / calls : 0;
  const creditedInjectionRate = injected ? Math.min(creditedUses / injected, 1) : 0;
  const tokensPerCreditedUse = creditedUses ? Math.round(totalOverheadTokens / creditedUses) : null;
  const base = { calls, injected, creditedUses, injectionRate, creditedInjectionRate, tokensPerCreditedUse };

  if (!calls) {
    return triggerKpiResult({
      status: 'no-data',
      ...base,
      recommendation: 'No memory trigger calls recorded in this window.',
    });
  }

  if (!injected) {
    return triggerKpiResult({
      status: 'no-injections',
      ...base,
      recommendation: 'Trigger is evaluating but has not injected memory yet.',
    });
  }

  if (!creditedUses) {
    return triggerKpiResult({
      status: 'learning',
      ...base,
      recommendation: 'Credit useful injected memory with `awareness memory used` to measure value.',
    });
  }

  const score = Math.round((creditedInjectionRate * 70) + (contextOverheadScore(avgContextOverheadPct) * 30));
  return triggerKpiResult({
    status: triggerKpiStatus(score),
    score,
    ...base,
    recommendation: 'Balance credited use rate against context overhead.',
  });
}

export function countCreditedTriggerInjections(triggerEvents, usedKeys) {
  const creditedKeys = new Set((usedKeys || []).filter(Boolean));
  if (!creditedKeys.size) return 0;
  return triggerEvents
    .filter((event) => event.source === 'memory.trigger')
    .filter((event) => Number(event.injected) > 0)
    .filter((event) => (event.injectedKeys || []).some((key) => creditedKeys.has(key)))
    .length;
}

export function formatTriggerEfficiencyKpi(kpi) {
  if (!kpi) return 'unknown';
  const score = kpi.score === null || kpi.score === undefined ? 'unscored' : `${kpi.score}/100`;
  const cost = kpi.tokensPerCreditedUse === null || kpi.tokensPerCreditedUse === undefined
    ? 'n/a'
    : `${kpi.tokensPerCreditedUse} tokens/use`;
  return `${kpi.status} (${score}; credited ${formatPercent(kpi.creditedInjectionRate)} of injections; cost ${cost})`;
}

function triggerKpiStatus(score) {
  if (score >= 80) return 'good';
  if (score >= 60) return 'watch';
  return 'poor';
}

function triggerKpiResult(values) {
  return {
    score: null,
    ...values,
  };
}

function contextOverheadScore(value) {
  if (value <= 0.01) return 1;
  if (value <= 0.03) return 0.75;
  if (value <= 0.05) return 0.5;
  return 0.2;
}

function formatPercent(value) {
  return `${Math.round((value || 0) * 100)}%`;
}
