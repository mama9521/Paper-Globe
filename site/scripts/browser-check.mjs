import ts from 'typescript';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { openChrome } from './chrome.mjs';

// Self-contained test adapter: no external requests, package downloads, or HTTP server.
// Production's Vite worker bundling is separately checked by the build/workflow gate.
const root = process.cwd();
const files = [...readdirSync(join(root, 'src/globe')).filter((file) => file.endsWith('.ts')).map((file) => `src/globe/${file}`), 'tests/browser-harness.ts'];
const definitions = files.map((file) => {
  let output = ts.transpileModule(readFileSync(join(root, file), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  output = output.replace(/new URL\(\s*['"]\.\/render\.worker\.ts['"],\s*import\.meta\.url\s*\)/g, 'globalThis.__testWorkerUrl');
  return `${JSON.stringify(file.replace(/\.ts$/, ''))}:function(module,exports,require){${output}\n}`;
}).join(',');
const loader = `const definitions={${definitions}};const cache={};function load(id){if(cache[id])return cache[id].exports;const module={exports:{}};cache[id]=module;if(!definitions[id])throw new Error('Missing test module '+id);definitions[id](module,module.exports,(path)=>{const parts=id.split('/');parts.pop();for(const part of path.split('/')){if(part==='..')parts.pop();else if(part!=='.')parts.push(part)}return load(parts.join('/'))});return module.exports}`;
const worker = `${loader};load('src/globe/render.worker');`;
const browser = await openChrome('about:blank');
try {
  await browser.evaluate(`document.body.innerHTML='<h1>Paper Globe browser checks</h1><pre>Running…</pre>';globalThis.__testWorkerUrl=${JSON.stringify('data:text/javascript;base64,' + Buffer.from(worker).toString('base64'))};${loader};load('tests/browser-harness');`);
  const results = await browser.until('window.__paperGlobeResults?.done && window.__paperGlobeResults', 90000);
  console.log(JSON.stringify(results, null, 2));
  if (!results.checks.length || results.checks.some((check) => !check.passed)) process.exitCode = 1;
} finally { await browser.close(); }
