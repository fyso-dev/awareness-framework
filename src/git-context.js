import path from 'node:path';
import { spawnSync } from 'node:child_process';

const NO_CONTEXT = { isRepo: false, repo: null, branch: null };
const GIT_TIMEOUT_MS = 2000;

export function detectGitContext(cwd) {
  const toplevel = git(cwd, ['rev-parse', '--show-toplevel']);
  if (!toplevel) return NO_CONTEXT;
  return {
    isRepo: true,
    repo: originSlug(cwd) || path.basename(toplevel),
    branch: git(cwd, ['branch', '--show-current']) || null,
  };
}

function git(cwd, args) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    timeout: GIT_TIMEOUT_MS,
  });
  if (result.error || result.status !== 0) return null;
  return String(result.stdout || '').trim() || null;
}

function originSlug(cwd) {
  const url = git(cwd, ['remote', 'get-url', 'origin']);
  if (!url) return null;
  const cleaned = url.replace(/\.git$/, '');
  const match = /([^/:]+)\/([^/]+)$/.exec(cleaned);
  return match ? `${match[1]}/${match[2]}` : null;
}
