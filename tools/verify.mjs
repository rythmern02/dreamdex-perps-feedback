import { access, readFile, readdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const text = async rel => readFile(new URL(rel, root), 'utf8');
const parse = async rel => JSON.parse(await text(rel));
const required = [
  '## Steps to reproduce', '## Expected', '## Actual', '## Evidence', '## Environment',
  '## Impact', '## Root cause', '## Suggested fix', '## Duplicate-scope analysis', '## Evidence limitations',
];
const allTestIds = new Set(Array.from({length:18}, (_,i) => String(i+1).padStart(3,'0')));
const expectedIds = new Set([...allTestIds].filter(id => id !== '010'));
const files = (await readdir(new URL('../feedback/', import.meta.url))).filter(f => f.endsWith('.md')).sort();
if (files.length !== expectedIds.size) throw new Error(`expected ${expectedIds.size} eligible feedback reports, found ${files.length}`);
const ids = new Set();
for (const file of files) {
  const body = await text(`feedback/${file}`);
  const match = file.match(/-(\d{3})-/);
  if (!match) throw new Error(`report filename has no numeric ID: ${file}`);
  if (ids.has(match[1])) throw new Error(`duplicate report ID ${match[1]}`);
  ids.add(match[1]);
  if (!/^# .+/m.test(body)) throw new Error(`${file} missing title`);
  for (const section of required) {
    if (!body.includes(section)) throw new Error(`${file} missing ${section}`);
    const content = body.split(section + '\n')[1]?.split('\n## ')[0]?.trim();
    if (!content) throw new Error(`${file} has an empty ${section}`);
  }
  const environment = body.split('## Environment\n')[1].split('\n## ')[0];
  for (const field of ['SDK:', 'Network:', 'Wallet:']) if (!environment.includes(field)) throw new Error(`${file} missing environment ${field}`);
  if (!/^1\. /m.test(body.split('## Steps to reproduce\n')[1].split('\n## ')[0])) throw new Error(`${file} missing numbered steps`);
  for (const match of body.matchAll(/\]\((\.\.\/[^)]+)\)/g)) await access(new URL(match[1],new URL(`feedback/${file}`,root)));
  const evidence = await parse(`research/evidence/reproductions/${match[1]}.json`);
  if (evidence.id !== match[1] || evidence.reproduced !== true) throw new Error(`${file} does not have passing saved evidence`);
  if (!/^Severity: (critical|major|normal)$/m.test(body)) throw new Error(`${file} has invalid severity`);
  if (!/^Area: (API|SDK|docs|app|contracts)$/m.test(body)) throw new Error(`${file} has invalid area`);
}
if (ids.size !== expectedIds.size || [...expectedIds].some(id => !ids.has(id))) throw new Error('eligible report IDs do not match; 010 must remain excluded as a duplicate');

const summary = await parse('research/evidence/reproduction-summary.json');
if (summary.sourceCommit !== '4e75896896e024c03e2033d5920514f249998cd6') throw new Error('unexpected upstream commit');
if (summary.sdkVersion !== '0.32.1') throw new Error('unexpected SDK version');
if (summary.results.length !== allTestIds.size || new Set(summary.results.map(x=>x.id)).size !== allTestIds.size || summary.results.some(x => !allTestIds.has(x.id) || x.reproduced !== true)) throw new Error('not all 18 controlled reproductions passed (including excluded duplicate 010)');
const fork = await parse('research/evidence/fork-sizing.json');
if (fork.reproduced !== true || fork.criteria?.deployedPoolRejectedBotOrder !== true || fork.criteria?.rejectionIsNotJavaScriptError !== true) throw new Error('fork-sizing evidence is not a genuine deployed-pool rejection');
if (fork.criteria?.unpaddedQuoteSufficient !== true || fork.criteria?.paddedQuoteInsufficient !== true) throw new Error('fork-sizing quote criteria failed');
console.log(`verified ${files.length} submission candidates: required sections, explicit environment fields, local evidence links and passing evidence; all 18 controlled reproductions passed; duplicate 010 excluded; saved fork-sizing criteria passed`);
