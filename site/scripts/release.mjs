import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const commit = git('rev-parse', 'HEAD');
if (git('status', '--porcelain')) throw new Error('Release requires a clean checkout. Commit or remove local changes first.');
if (git('branch', '--show-current') !== 'main') throw new Error('Production releases must be made from main. Use a separately named Worker for previews.');
if (!process.env.npm_execpath) throw new Error('Run this command with npm run deploy:cloudflare.');
for (const script of ['check', 'build']) {
  const result = spawnSync(process.execPath, [process.env.npm_execpath, 'run', script], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const packagePath = resolve('node_modules/wrangler');
const pkg = JSON.parse(readFileSync(resolve(packagePath, 'package.json'), 'utf8'));
const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin.wrangler;
const result = spawnSync(process.execPath, [resolve(packagePath, bin), 'deploy', '--config', 'dist/server/wrangler.json', '--tag', commit.slice(0, 12), '--message', `Source ${commit}`], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
process.stdout.write(result.stdout ?? ''); process.stderr.write(result.stderr ?? '');
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
const versionId = result.stdout.match(/Current Version ID:\s*([0-9a-f-]+)/i)?.[1] ?? null;
mkdirSync('.release', { recursive: true });
writeFileSync(`.release/${commit}.json`, JSON.stringify({ commit, versionId, url: 'https://paper-globe.mtaxmraz.workers.dev', deployedAt: new Date().toISOString(), validation: 'check and build passed', smokeTest: 'pending', rollbackTarget: 'record the previous version before release', cliOutput: result.stdout }, null, 2) + '\n');
console.log(`Release evidence: .release/${commit}.json. Complete the deployed smoke test and record the rollback version; deployment alone is not release acceptance.`);
if (!versionId) console.warn('Version ID was not recognized in Wrangler output. Copy the actual ID from the deployment history into the release evidence.');
