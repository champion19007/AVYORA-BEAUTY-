import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('../../..', import.meta.url)); // the project root, three folders up
const schema = readFileSync(join(ROOT, 'src/db/schema.ts'), 'utf8');

// Tables: name, columns, and the doc comment just above.
const tables = [];
const re = /((?:\/\*\*(?:(?!\*\/)[\s\S])*\*\/\s*)?)export const (\w+) = pgTable\(\s*'(\w+)',\s*\{([\s\S]*?)\n {0,2}\}[,)]/g;
let m;
while ((m = re.exec(schema))) {
  const doc = m[1].replace(/\/\*\*|\*\/|^\s*\* ?/gm, ' ').replace(/\s+/g, ' ').trim();
  const cols = [];
  const colRe = /^\s{2,4}(\w+): (\w+)\('(\w+)'([^\n]*)/gm;
  let c;
  while ((c = colRe.exec(m[4]))) {
    const rest = c[4];
    cols.push({ column: c[3], type: c[2], notNull: /notNull\(\)/.test(rest), pk: /primaryKey\(\)/.test(rest), fk: /references\(/.test(rest) });
  }
  tables.push({ name: m[3], doc: doc.slice(0, 400), cols });
}
// Enums
const enums = [...schema.matchAll(/export const (\w+) = pgEnum\('(\w+)', \[([\s\S]*?)\]\)/g)].map((e) => ({ name: e[2], values: [...e[3].matchAll(/'([^']+)'/g)].map((v) => v[1]) }));

// Routes
function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (f !== '__tests__') walk(p, out); }
    else if (f === 'page.tsx' || f === 'route.ts') out.push(p);
  }
  return out;
}
const app = join(ROOT, 'src/app');
const routes = walk(app).map((p) => {
  const rel = relative(app, p).split(sep).join('/');
  const path = '/' + rel.replace(/\/?(page\.tsx|route\.ts)$/, '').split('/').filter((s) => !/^\(.*\)$/.test(s)).join('/');
  const src = readFileSync(p, 'utf8');
  const methods = rel.endsWith('route.ts') ? ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].filter((x) => new RegExp('export (async )?function ' + x + '[^A-Za-z]|export const ' + x + '[^A-Za-z]|export \\{[^}]*\\b' + x + '\\b').test(src)) : [];
  const docm = src.match(/\/\*\*([\s\S]*?)\*\//);
  const doc = docm ? docm[1].replace(/^\s*\* ?/gm, ' ').replace(/\s+/g, ' ').trim().slice(0, 300) : '';
  return { kind: rel.endsWith('route.ts') ? 'api' : 'page', path: path === '/' ? '/' : path.replace(/\/$/, ''), methods, doc, file: 'src/app/' + rel };
}).sort((a, b) => a.path.localeCompare(b.path));

// Env vars with their comment block
const envLines = readFileSync(join(ROOT, '.env.example'), 'utf8').split(/\r?\n/);
const env = []; let comment = []; let section = '';
for (const line of envLines) {
  const sec = line.match(/^# -{3,}\s*(.*?)\s*-*$/) || null;
  if (/^# -{5,}$/.test(line)) { comment = []; continue; }
  if (sec && sec[1]) { section = sec[1].replace(/-+$/, '').trim(); comment = []; continue; }
  if (/^#\s?/.test(line)) { comment.push(line.replace(/^#\s?/, '')); continue; }
  const v = line.match(/^([A-Z0-9_]+)=/);
  if (v) { env.push({ name: v[1], section, note: comment.join(' ').replace(/\s+/g, ' ').trim().slice(0, 350) }); comment = []; }
  else if (!line.trim()) comment = [];
}
// Migrations
const migrations = readdirSync(join(ROOT, 'drizzle')).filter((f) => f.endsWith('.sql'));
// Test files
const tests = []; (function w(d) { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (f !== 'node_modules') w(p); } else if (/\.test\.tsx?$/.test(f)) tests.push(relative(ROOT, p).split(sep).join('/')); } })(join(ROOT, 'src'));
writeFileSync('facts.json', JSON.stringify({ tables, enums, routes, env, migrations, tests }, null, 1));
console.log({ tables: tables.length, cols: tables.reduce((s, t) => s + t.cols.length, 0), enums: enums.length, pages: routes.filter((r) => r.kind === 'page').length, apis: routes.filter((r) => r.kind === 'api').length, env: env.length, migrations: migrations.length, tests: tests.length });
