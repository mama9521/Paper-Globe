import ts from 'typescript';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const filter = process.argv[2] ?? '';
const tests = readdirSync(join(root, 'tests')).filter((file) => file.endsWith('.test.ts') && file.includes(filter));
if (!tests.length) throw new Error('No matching tests.');
const output = mkdtempSync(join(tmpdir(), 'paper-globe-tests-'));
try {
  const program = ts.createProgram(tests.map((file) => join(root, 'tests', file)), {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.Node10, strict: true, esModuleInterop: true,
    skipLibCheck: true, rootDir: root, outDir: output, types: ['node'],
    typeRoots: [join(root, 'node_modules/@types')], lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length) {
    console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCurrentDirectory: () => root, getCanonicalFileName: (name) => name, getNewLine: () => '\n' }));
    process.exitCode = 1;
  } else {
    program.emit();
    writeFileSync(join(output, 'package.json'), '{"type":"commonjs"}\n');
    const result = spawnSync(process.execPath, ['--test', ...tests.map((file) => resolve(output, 'tests', file.replace(/\.ts$/, '.js')))], { stdio: 'inherit' });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  }
} finally { rmSync(output, { recursive: true, force: true }); }
