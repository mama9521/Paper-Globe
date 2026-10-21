import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
let commit = process.env.SOURCE_REVISION ?? 'unversioned'; let dirty = true;
try {
  commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  dirty = Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim());
} catch { /* An archive can still build locally, but is not a releasable checkout. */ }
mkdirSync('public', { recursive: true });
writeFileSync('public/build.json', JSON.stringify({ commit, dirty }, null, 2) + '\n');
console.log(`Build source: ${commit}${dirty ? ' (not a clean release checkout)' : ''}`);
