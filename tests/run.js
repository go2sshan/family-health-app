// Runs the medicine-schedule logic tests without a phone: node tests/run.js
const ts = require('typescript'), fs = require('fs'), path = require('path');
const out = path.join(__dirname, 'build'); fs.mkdirSync(out, { recursive: true });
const src = fs.readFileSync(path.join(__dirname, '../src/lib/meds.ts'), 'utf8').replace(/import \{ supabase \}.*\n/, 'const supabase = {};\n');
fs.writeFileSync(path.join(out, 'meds.js'), ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText);
require('./meds.test.js');
