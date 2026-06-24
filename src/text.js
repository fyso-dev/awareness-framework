const RECALL_ALIASES = {
  memoria: ['memory'],
  memorias: ['memory'],
  memory: ['memoria', 'memorias'],
  user: ['usuario', 'usuarios'],
  users: ['usuario', 'usuarios'],
  usuario: ['user', 'users'],
  usuarios: ['user', 'users'],
  repo: ['repository', 'repositorio'],
  repository: ['repo', 'repositorio'],
  repositorio: ['repo', 'repository'],
  config: ['configuration', 'configuracion'],
  configuration: ['config', 'configuracion'],
  configuracion: ['config', 'configuration'],
  db: ['database'],
  database: ['db'],
  release: ['publish', 'version'],
  publish: ['release'],
};

// Strip a leading/trailing run of `char` without an anchored regex quantifier
// (avoids regex backtracking warnings). Pure and linear.
export function trimEdgeChar(value, char) {
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === char) start += 1;
  while (end > start && value[end - 1] === char) end -= 1;
  return value.slice(start, end);
}

export function normalizeSearchText(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function recallTermGroups(query) {
  return normalizeSearchText(query)
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => new Set([term, ...recallTokenVariants(term), ...(RECALL_ALIASES[term] || [])]))
    .map((terms) => [...terms].filter(Boolean))
    .filter((terms, index, groups) => groups.findIndex((group) => group[0] === terms[0]) === index);
}

export function expandSearchQuery(query) {
  const groups = recallTermGroups(query);
  if (!groups.length) return [];
  const original = normalizeSearchText(query);
  const expanded = [original, groups.map((terms) => terms.join(' ')).join(' ')];
  for (const group of groups) {
    for (const term of group) expanded.push(term);
  }
  return [...new Set(expanded.filter(Boolean))];
}

function recallTokenVariants(term) {
  const variants = [];
  if (term.endsWith('es') && term.length > 4) variants.push(term.slice(0, -2));
  if (term.endsWith('s') && term.length > 3) variants.push(term.slice(0, -1));
  if (term.endsWith('ing') && term.length > 5) variants.push(term.slice(0, -3));
  if (term.endsWith('ed') && term.length > 4) variants.push(term.slice(0, -2));
  if (term.endsWith('mente') && term.length > 7) variants.push(term.slice(0, -5));
  return variants.filter((variant) => variant.length >= 3);
}
