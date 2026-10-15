#!/usr/bin/env node
// npm test: a fresh database in a temp folder, migrate twice, seed twice, then every
// command with assertions on what it returns. PASS or a failing assertion.
// Set TEST_DATABASE_URL to an empty Postgres database to run the same checks there.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { findIntercepts } from './drillholes.mjs';

const dir = mkdtempSync(path.join(tmpdir(), 'drillholes-smoke-'));
process.env.DATA_DIR = path.join(dir, 'db');
process.env.OUTPUT_DIR = dir;
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || '';
const env = { ...process.env };
const covered = new Set();
let checks = 0;

function run(script, args = [], ok = true) {
  const r = spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts', script), ...args], { cwd: REPO_ROOT, env, encoding: 'utf8' });
  assert.equal(r.status, ok ? 0 : 1, `${script} ${args.join(' ')}\n${r.stdout}\n${r.stderr}`);
  checks++;
  return r;
}
function cli(cmd, args = [], ok = true) {
  covered.add(cmd);
  const r = run('drillholes.mjs', [cmd, ...args, ...(cmd === 'help' ? [] : ['--json'])], ok);
  return ok && cmd !== 'help' ? JSON.parse(r.stdout) : r;
}
const refuse = (cmd, args, pattern) => {
  const r = cli(cmd, args, false);
  assert.match(r.stderr, pattern, `${cmd} should refuse: ${r.stderr}`);
};
async function query(sql, params = []) {
  const db = await getDb();
  try { return await db.query(sql, params); } finally { await db.close(); }
}
const actor = '--actor=Tester';
const rules = () => cli('compliance');
const has = (rule, subject) => rules().some((c) => c.rule === rule && (!subject || c.subject === subject));
const fixture = (...p) => path.join(REPO_ROOT, 'fixtures', ...p);

try {
  assert.equal((await query("select tablename from pg_tables where schemaname = 'public'")).length, 0, 'TEST_DATABASE_URL must point at an empty database');
  run('migrate.mjs'); run('migrate.mjs'); run('seed.mjs'); run('seed.mjs');
  assert.equal((await query('select count(*)::int as n from holes'))[0].n, 7, 'seed runs once');
  assert.equal((await query('select count(*)::int as n from samples'))[0].n, 228, 'seed runs once');

  // The intercept rules on their own.
  const s = (from, value) => ({ from_m: from, to_m: from + 1, value });
  assert.deepEqual(findIntercepts([s(0, 0.1), s(1, 2), s(2, 0.2), s(3, 3), s(4, 0.1)], { cutoff: 0.5, dilution: 1 }).map((x) => [x.from_m, x.to_m, x.grade]), [[1, 4, 1.73]]);
  assert.deepEqual(findIntercepts([s(0, 2), s(1, 0.1), s(2, 0.1), s(3, 2)], { cutoff: 0.5, dilution: 1 }).map((x) => [x.from_m, x.to_m]), [[0, 1], [3, 4]]);
  assert.deepEqual(findIntercepts([s(0, 2), { from_m: 5, to_m: 6, value: 2 }], { cutoff: 0.5, dilution: 5 }).length, 2, 'a gap in sampling ends a run');
  assert.deepEqual(findIntercepts([s(0, 0.6)], { cutoff: 0.5, minLength: 2 }), []);

  // Reads on the demo.
  assert.match(cli('help').stdout, /import mx-deposit/);
  assert.equal(cli('projects')[0].holes, 7);
  assert.equal(cli('tenements').length, 3);
  const reports = cli('reports');
  assert.deepEqual(reports.map((r) => [r.tenement, r.state]), [['E 29/1240', 'lodged'], ['E 29/1215', 'overdue'], ['E 29/1187', 'due']]);
  assert.equal(Number(reports[2].metres_in_period), 120);
  const holes = cli('holes');
  assert.equal(holes.length, 7);
  assert.deepEqual(holes.find((h) => h.hole === 'KRRC004').not_dispatched, 42);
  assert.equal(cli('drilling').reduce((a, r) => a + Number(r.metres), 0), 228);
  const dispatches = cli('dispatches');
  assert.deepEqual(dispatches.map((d) => d.stage), ['in transit', 'at the lab', 'results in']);
  assert.equal(cli('pending').length, 3);
  assert.equal(cli('standards').length, 3);
  assert.equal(cli('labs').length, 2);
  assert.equal(cli('settings').length, 13);
  assert.deepEqual(cli('activity'), []);
  const ruleSet = new Set(rules().map((c) => c.rule));
  for (const r of ['COLLAR_SURVEY', 'DATUM', 'DOWNHOLE_SURVEY', 'AZIMUTH_REFERENCE', 'LOGGING', 'INTERVALS', 'RECOVERY', 'CHAIN_OF_CUSTODY', 'RESULTS_LATE',
    'QC_STANDARD', 'QC_BLANK', 'QC_DUPLICATE', 'QC_RATE', 'HOLE_NOT_CAPPED', 'REHABILITATION', 'REPORT_DUE']) {
    assert(ruleSet.has(r), `demo shows ${r}`);
  }
  assert.equal(rules().length, 17);
  const hole = cli('hole', ['--hole=krrc002']);
  assert.equal(hole.logging.length, 4);
  assert.deepEqual(hole.issues.map((i) => i.rule), ['INTERVALS', 'LOGGING']);
  refuse('hole', ['--hole=KRRC'], /More than one hole matches/);
  assert.equal(cli('samples', ['--dispatch=KR-D001']).length, 67);
  assert.equal(cli('samples', ['--hole=KRRC004']).filter((x) => x.recovery_pct === null).length, 3);
  refuse('samples', [], /Required: --hole/);
  const assays = cli('assays', ['--hole=KRRC001']);
  assert.equal(assays.length, 60);
  assert.equal(assays.find((a) => a.sample === 'KR10007').Au, '<DL');
  assert.equal(cli('assays', ['--hole=KRRC002'])[0].Au, 'pending');
  const ints = cli('intercepts', ['--hole=KRRC001']);
  assert.deepEqual(ints.map((x) => [x.from_m, x.to_m, x.grade]), [[31, 36, 3.22], [48, 50, 0.68]]);
  assert.deepEqual(cli('intercepts', ['--hole=KRRC001', '--cutoff=1', '--dilution=0']).map((x) => [x.from_m, x.length_m, x.grade]), [[32, 4, 3.82]]);
  const qc = cli('qaqc', ['--dispatch=KR-D001']);
  assert.deepEqual(qc.standards.map((x) => x.result), ['pass', 'fail', 'pass']);
  assert.equal(qc.blanks[0].result, 'fail');
  assert.deepEqual(qc.duplicates.map((x) => x.result), ['pass', 'fail', 'pass']);
  assert.equal(qc['insertion rates'][0].standards_needed, 3);
  assert.equal(cli('qaqc')['insertion rates'].length, 3);
  const attention = cli('attention');
  assert.equal(attention['drilling now'][0].hole, 'KRDD001');
  assert.equal(attention['batches waiting'].length, 2);
  assert.equal(attention['reports due'].length, 2);
  const weekly = cli('weekly-review');
  assert.equal(weekly['qc failures'].length, 4);
  assert(weekly['compliance by rule'].length >= 16);

  // Drafts and files.
  const ann = cli('draft-announcement');
  assert.equal(ann.intercepts, 2);
  assert.deepEqual(ann.pending, ['KRRC002', 'KRRC003', 'KRRC004']);
  const md = readFileSync(ann.file, 'utf8');
  assert.match(md, /\| KRRC001 \| 31 \| 36 \| 5 \| 3\.22 g\/t Au \| 16\.1 \|/);
  assert.match(md, /QC_STANDARD KR90002/);
  const chase = cli('draft-lab-chase', ['--dispatch=KR-D003']);
  assert.equal(chase.stage, 'in transit');
  assert.match(readFileSync(chase.file, 'utf8'), /have not had your receipt/);
  refuse('draft-lab-chase', ['--dispatch=KR-D001'], /already has results/);
  const rf = cli('report-files', ['--tenement=E29/1187', `--out=${path.join(dir, 'report-e1187')}`]);
  assert.equal(rf.holes, 2);
  assert.deepEqual(rf.results_pending, ['KRRC002']);
  assert.match(readFileSync(path.join(rf.dir, 'collar.csv'), 'utf8'), /# Geodetic datum: GDA2020[\s\S]*KRRC001,RC,352410\.2/);
  assert.equal(readFileSync(path.join(rf.dir, 'assay.csv'), 'utf8').trim().split('\n').length, 6 + 1 + 60);
  refuse('report-files', ['--tenement=E29/1187', `--out=${path.join(dir, 'report-e1187')}`], /already exists/);
  const ex = cli('export', [`--out=${path.join(dir, 'archive.json')}`]);
  assert.equal(ex.counts.samples, 228);
  refuse('export', [`--out=${path.join(dir, 'archive.json')}`], /EEXIST|exists/);

  // Lab results arrive for KR-D002.
  const dry = cli('load-results', [`--file=${fixture('lab-results-kr-d002.csv')}`, '--dispatch=KR-D002', '--method=FA50', actor, '--dry-run']);
  assert.equal(dry.results_added, 129);
  assert.equal(dry.preview, 'Preview only. Nothing was changed.');
  assert(has('RESULTS_LATE', 'KR-D002'), 'dry run changed nothing');
  const loaded = cli('load-results', [`--file=${fixture('lab-results-kr-d002.csv')}`, '--dispatch=KR-D002', '--method=FA50', actor]);
  assert.deepEqual([loaded.batch_complete, loaded.below_detection, loaded.elements], [true, 6, ['Au', 'Cu']]);
  assert(!has('RESULTS_LATE'));
  assert.deepEqual(cli('intercepts', ['--hole=KRRC002']).map((x) => [x.from_m, x.to_m, x.grade]), [[40, 45, 1.67]]);
  assert.equal(cli('load-results', [`--file=${fixture('lab-results-kr-d002.csv')}`, '--dispatch=KR-D002', actor]).results_updated, 129);
  refuse('load-results', [`--file=${fixture('lab-results-kr-d002.csv')}`, '--dispatch=KR-D003', actor], /is not in batch KR-D003/);

  // A hole from plan to lab.
  cli('plan-hole', ['--name=krrc006', '--project=KR', '--tenement=E 29/1215', '--type=RC', '--depth=70', '--easting=352610', '--northing=6634120', '--azimuth=270', '--dip=-60', actor]);
  refuse('plan-hole', ['--name=KRRC007', '--project=KR', '--type=XX', actor], /Invalid hole type/);
  cli('start-hole', ['--hole=KRRC006', '--contractor=Example Drilling', '--rig=RC-07', actor]);
  refuse('start-hole', ['--hole=KRRC006', actor], /is drilling, not planned/);
  cli('log-interval', ['--hole=KRRC006', '--from=0', '--to=10', '--lith=clay', '--weathering=CW', actor]);
  refuse('log-interval', ['--hole=KRRC006', '--from=5', '--to=12', '--lith=sap', actor], /already logged 0-10 m as CLAY/);
  cli('log-interval', ['--hole=KRRC006', '--from=10', '--to=45', '--lith=bslt', '--description=Fresh basalt', actor]);
  const sheet = cli('sample-hole', ['--hole=KRRC006', '--from=0', '--to=45', '--prefix=KR', '--start=60001', '--standards=CRM-LOW,CRM-HIGH', '--blank=BLANK-1', actor]);
  assert.deepEqual([sheet.primary, sheet.standard, sheet.blank, sheet.duplicate, sheet.last_ticket], [45, 2, 1, 2, 'KR60050']);
  refuse('sample-hole', ['--hole=KRRC006', '--from=40', '--to=50', '--prefix=KR', '--start=61001', actor], /already sampled/);
  refuse('sample-hole', ['--hole=KRRC006', '--from=50', '--to=52', '--prefix=KR', '--start=60001', actor], /already used/);
  refuse('complete-hole', ['--hole=KRRC006', '--depth=40', actor], /deeper than 40 m/);
  cli('complete-hole', ['--hole=KRRC006', '--depth=45', actor]);
  refuse('complete-hole', ['--hole=KRRC006', '--depth=45', actor], /already complete/);
  assert(has('COLLAR_SURVEY', 'KRRC006') && has('DOWNHOLE_SURVEY', 'KRRC006') && has('RECOVERY', 'KRRC006') && has('HOLE_NOT_CAPPED', 'KRRC006'));
  cli('survey-collar', ['--hole=KRRC006', '--easting=352611.2', '--northing=6634121.0', '--rl=413.5', '--method=rtk', actor]);
  cli('add-survey', ['--hole=KRRC006', '--depth=45', '--azimuth=270.5', '--dip=-59.7', '--ref=true', actor]);
  refuse('add-survey', ['--hole=KRRC006', '--depth=60', '--azimuth=270', '--dip=-60', '--ref=true', actor], /ends at 45 m/);
  assert.equal(cli('set-recovery', ['--hole=KRRC006', '--from=0', '--to=45', '--pct=88', actor]).samples_updated, 47);
  cli('cap-hole', ['--hole=KRRC006', actor]);
  for (const r of ['COLLAR_SURVEY', 'DOWNHOLE_SURVEY', 'RECOVERY', 'HOLE_NOT_CAPPED', 'LOGGING']) assert(!has(r, 'KRRC006'), `${r} cleared for KRRC006`);
  const d4 = cli('dispatch', ['--name=KR-D004', '--lab=EAL', '--hole=KRRC006', '--consignment=CN-47001', actor]);
  assert.deepEqual([d4.samples, d4.standards, d4.blanks, d4.duplicates, d4.warning], [50, 2, 1, 2, undefined]);
  refuse('dispatch', ['--name=KR-D005', '--lab=EAL', '--samples=KR60001-KR60003', actor], /already in a batch/);
  cli('receive', ['--dispatch=KR-D004', '--job=PER26-05120', actor]);
  refuse('receive', ['--dispatch=KR-D004', actor], /was received on/);

  // KRRC004 goes to the lab short of QC, then gets its inserts.
  cli('add-qc', ['--name=KR90019', '--kind=standard', '--standard=CRM-LOW', '--hole=KRRC004', actor]);
  cli('add-qc', ['--name=KR90020', '--kind=duplicate', '--of=KR40010', actor]);
  refuse('add-qc', ['--name=KR90021', '--kind=duplicate', '--of=KR90019', actor], /not a primary sample/);
  const d5 = cli('dispatch', ['--name=KR-D005', '--lab=GSP', '--samples=KR40001-KR40042,KR90019,KR90020', actor]);
  assert.equal(d5.samples, 44);
  assert.match(d5.warning, /Below the house QC rate/);
  assert(has('QC_RATE', 'KR-D005'));
  cli('set-recovery', ['--hole=KRRC004', '--from=11', '--to=14', '--pct=76', actor]);
  assert(!has('RECOVERY', 'KRRC004'));

  // Field and reports.
  cli('cap-hole', ['--hole=KRRC003', actor]);
  cli('rehab-hole', ['--hole=KRRC001', actor]);
  refuse('cap-hole', ['--hole=KRDD001', actor], /finish or abandon it first/);
  assert(!has('HOLE_NOT_CAPPED', 'KRRC003') && !has('REHABILITATION', 'KRRC001'));
  cli('lodge-report', ['--tenement=E 29/1215', '--reference=A-151002', actor]);
  assert(!has('REPORT_DUE', 'E 29/1215'));
  cli('abandon-hole', ['--hole=KRRC005', '--depth=12', '--note=Hole collapsed in cavity', actor]);
  assert(has('HOLE_NOT_CAPPED', 'KRRC005'));

  // Setup records.
  cli('add-project', ['--name=Bluebush Copper Project', '--code=bb', '--commodity=Cu', actor]);
  cli('add-tenement', ['--name=E 29/1300', '--project=BB', '--granted=2025-03-01', actor]);
  refuse('add-tenement', ['--name=E 29/1301', '--project=BB', '--granted=2025-02-30', actor], /Invalid grant date/);
  cli('add-standard', ['--name=CRM-CU', '--element=Cu', '--value=1200', '--sd=40', '--units=ppm', actor]);
  refuse('add-standard', ['--name=CRM-X', '--element=Cu', '--value=10', '--units=ppm', actor], /Required: --sd/);
  cli('add-lab', ['--name=Example Lab Adelaide', '--code=ela', '--email=lab@example.test', actor]);
  const before = cli('settings').find((x) => x.key === 'standard_fail_sd').value;
  cli('set', ['--key=standard_fail_sd', '--value=5', actor]);
  assert(!has('QC_STANDARD', 'KR90002'), 'a looser limit clears the CRM-HIGH failure');
  cli('set', ['--key=standard_fail_sd', `--value=${before}`, actor]);
  refuse('set', ['--key=nope', '--value=1', actor], /No setting nope/);

  // MX Deposit import, twice.
  const mxDry = cli('import', ['mx-deposit', `--dir=${fixture('mx-deposit')}`, '--project=KR', actor, '--dry-run']);
  assert.equal(mxDry.holes_added, 3);
  assert.equal((await query("select count(*)::int as n from holes where name like 'MX%'"))[0].n, 0, 'dry run imports nothing');
  const mx = cli('import', ['mx-deposit', `--dir=${fixture('mx-deposit')}`, '--project=KR', actor]);
  assert.deepEqual([mx.holes_added, mx.surveys_added, mx.intervals_added, mx.samples_added, mx.results_added, mx.tenements_missing], [3, 3, 4, 6, 6, ['E 29/9999']]);
  const mx2 = cli('import', ['mx-deposit', `--dir=${fixture('mx-deposit')}`, '--project=KR', actor]);
  assert.deepEqual([mx2.holes_added, mx2.holes_unchanged, mx2.samples_added, mx2.results_added], [0, 3, 0, 0]);
  const mxh = cli('hole', ['--hole=MXRC102']);
  assert.deepEqual([mxh.hole[0].collar, mxh.hole[0].tenement, mxh.surveys[0].azimuth_ref], ['GPS', 'E 29/1187', 'magnetic']);
  assert.equal(cli('hole', ['--hole=MXDD103']).hole[0].status, 'planned');
  assert.deepEqual(cli('intercepts', ['--hole=MXRC101']).map((x) => [x.from_m, x.to_m]), [[4, 8]]);
  assert.equal(cli('qaqc', ['--dispatch=MX-D01']).duplicates[0].result, 'pass');
  refuse('import', ['mx-deposit', `--dir=${path.join(dir, 'nowhere')}`, '--project=KR', actor], /Missing collar\.csv/);

  // Documents and views.
  const docs = run('docs.mjs');
  assert.match(docs.stdout, /document\(s\) rendered/);
  for (const d of ['hole-summary', 'sample-submission', 'tenement-drilling']) assert(readdirSync(path.join(dir, 'docs-out', d)).length > 0, `${d} rendered`);
  const summary = readdirSync(path.join(dir, 'docs-out', 'hole-summary')).find((f) => f.startsWith('krrc001'));
  assert.match(readFileSync(path.join(dir, 'docs-out', 'hole-summary', summary), 'utf8'), /Quartz vein/);
  run('view.mjs');
  for (const v of ['week', 'qaqc', 'holes']) assert(existsSync(path.join(dir, 'views', `${v}.html`)), `${v} view`);

  // Audit trail, append only.
  assert((cli('activity')).length > 50);
  await assert.rejects(query('delete from events'), /cannot be changed/);

  // Every slash command drives a real command, and every command has a slash command.
  const commandFiles = readdirSync(path.join(REPO_ROOT, '.claude', 'commands')).filter((f) => f.endsWith('.md') && f !== 'README.md').map((f) => f.replace(/\.md$/, ''));
  const npmOnly = new Set(['customise', 'new-view']);
  for (const c of commandFiles) {
    if (npmOnly.has(c)) continue;
    assert(covered.has(c), `/${c} is exercised by the smoke test`);
  }
  for (const c of covered) if (c !== 'help') assert(commandFiles.includes(c), `${c} has a slash command`);

  console.log(`PASS: ${checks} runs, ${commandFiles.length} slash commands, ${covered.size} CLI commands covered`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
