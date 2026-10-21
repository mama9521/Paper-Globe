import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
// A non-mutating, dependency-free source-hygiene gate. `npm run format` still runs oxfmt.
const ignored = new Set(['node_modules', '.git', '.next', '.vinext', '.wrangler', 'dist', 'out', 'coverage', 'outputs', 'work', '.release']);
const problems = [];
function visit(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) visit(path);
    else if (/\.(ts|tsx|mjs|css)$/.test(entry.name)) {
      const text = readFileSync(path, 'utf8');
      if (/\r/.test(text) || /[ \t]+$/m.test(text) || (text.length && !text.endsWith('\n'))) problems.push(path);
    }
  }
}
visit(process.cwd());
if (problems.length) { console.error('Use LF, remove trailing whitespace, and end text with a newline:\n' + problems.join('\n')); process.exitCode = 1; }
else console.log('Source whitespace checks passed (no files modified).');
