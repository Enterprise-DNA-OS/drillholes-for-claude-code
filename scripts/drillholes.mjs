#!/usr/bin/env node
// The one CLI for drillhole data. Human tables by default, --json for machines.
//   npm run dh -- help
//   npm run dh -- attention
//   npm run dh -- intercepts --hole=KRRC001 --element=Au --cutoff=0.5
//   npm run dh -- complete-hole --hole=KRRC005 --depth=82 --actor=Jess
// Every change takes --actor and can be previewed with --dry-run.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { parseCsv, pick } from './lib/csv.mjs';
import { table as textTable } from './lib/format.mjs';
import { page, table, writeOut, esc } from './lib/render.mjs';

// ---------------------------------------------------------------- reads

export const reads = {
  projects: `select p.name, p.code, p.commodity, p.datum, p.projection, p.zone,
               (select count(*) from tenements t where t.project_id = p.id)::int as tenements,
               (select count(*) from holes h where h.project_id = p.id)::int as holes
             from projects p order by p.code`,
  tenements: `select t.name, p.code as project, t.jurisdiction, t.holder, t.granted_on, coalesce(t.expires_on::text, '') as expires_on, t.status,
                (select count(*) from holes h where h.tenement_id = t.id)::int as holes
              from tenements t join projects p on p.id = t.project_id order by t.name`,
  reports: `select tenement, project, last_anniversary, due_on, state, coalesce(lodged_on::text, '') as lodged_on, reference, holes_in_period, metres_in_period
            from tenement_reports order by due_on`,
  holes: `select hole, project, tenement, hole_type as type, status, planned_depth, max_depth, collar_method as collar, surveys,
            metres_logged as logged_m, samples, not_dispatched, awaiting_results, coalesce(completed_on::text, '') as completed_on
          from hole_status order by hole`,
  drilling: `select coalesce(contractor, '') as contractor, coalesce(rig, '') as rig, to_char(completed_on, 'YYYY-MM') as month,
               count(*)::int as holes, sum(max_depth) as metres
             from holes where completed_on is not null and status in ('complete', 'abandoned')
             group by 1, 2, 3 order by 3 desc, 1, 2`,
  dispatches: `select dispatch, lab, sent_on, coalesce(received_on::text, '') as received_on, coalesce(results_on::text, '') as results_on,
                 coalesce(lab_job, '') as lab_job, samples, standards, blanks, duplicates, with_results, stage, days_in_stage
               from dispatch_status order by sent_on desc`,
  pending: `select dispatch, lab, stage, days_in_stage, samples, with_results from dispatch_status where stage <> 'results in'
            union all
            select '(not dispatched) ' || hole, '', 'core yard', null, not_dispatched, 0 from hole_status where not_dispatched > 0
            order by 4 desc nulls last, 1`,
  standards: `select name, kind, element, certified_value, coalesce(sd::text, '') as sd, units from standards order by kind desc, name, element`,
  labs: `select name, code, coalesce(email, '') as email,
           (select count(*) from dispatches d where d.lab_id = l.id)::int as dispatches from labs l order by name`,
  compliance: `select rule, subject, issue from compliance_issues order by rule, subject`,
  settings: `select key, value, note from settings order by key`,
  activity: `select to_char(created_at, 'YYYY-MM-DD HH24:MI') as at, actor, action, substr(record_id::text, 1, 8) as record from events order by created_at, id`,
};

const MUTATIONS = {
  'add-project': ['name', 'code', 'commodity', 'datum', 'projection', 'zone'],
  'add-tenement': ['name', 'project', 'jurisdiction', 'holder', 'granted', 'expires'],
  'lodge-report': ['tenement', 'kind', 'period-end', 'on', 'reference'],
  'plan-hole': ['name', 'project', 'tenement', 'type', 'depth', 'easting', 'northing', 'azimuth', 'dip'],
  'start-hole': ['hole', 'on', 'contractor', 'rig'],
  'complete-hole': ['hole', 'depth', 'on'],
  'abandon-hole': ['hole', 'depth', 'on', 'note'],
  'survey-collar': ['hole', 'easting', 'northing', 'rl', 'method', 'datum', 'zone'],
  'add-survey': ['hole', 'depth', 'azimuth', 'dip', 'method', 'ref'],
  'log-interval': ['hole', 'from', 'to', 'lith', 'weathering', 'alteration', 'description', 'by', 'on'],
  'sample-hole': ['hole', 'from', 'to', 'interval', 'prefix', 'start', 'standards', 'blank', 'duplicates'],
  'add-qc': ['hole', 'name', 'kind', 'standard', 'of'],
  'set-recovery': ['hole', 'from', 'to', 'pct'],
  'add-standard': ['name', 'kind', 'element', 'value', 'sd', 'units'],
  'add-lab': ['name', 'code', 'email'],
  dispatch: ['name', 'lab', 'hole', 'samples', 'on', 'consignment'],
  receive: ['dispatch', 'on', 'job'],
  'load-results': ['file', 'dispatch', 'method', 'on'],
  'cap-hole': ['hole', 'on'],
  'rehab-hole': ['hole', 'on'],
  set: ['key', 'value'],
  import: ['dir', 'map', 'project'],
};
const OTHER = {
  hole: ['hole'],
  samples: ['hole', 'dispatch'],
  assays: ['hole', 'element'],
  qaqc: ['dispatch'],
  intercepts: ['hole', 'element', 'cutoff', 'dilution', 'min-length'],
  attention: [],
  'weekly-review': [],
  'report-files': ['tenement', 'out'],
  export: ['out'],
  'draft-announcement': ['element', 'cutoff', 'dilution', 'min-length', 'hole'],
  'draft-lab-chase': ['dispatch'],
  help: [],
};
const FLAGS = { ...Object.fromEntries(Object.keys(reads).map((k) => [k, []])), ...OTHER, ...MUTATIONS };
const BOOLEAN = new Set(['json', 'dry-run']);

// ---------------------------------------------------------------- argument parsing

function parseArgs(argv) {
  const cmd = argv[0] || 'help';
  if (!FLAGS[cmd]) throw new Error(`Unknown command "${cmd}". Run: npm run dh -- help`);
  const opts = {};
  const positional = [];
  for (const arg of argv.slice(1)) {
    if (!arg.startsWith('--')) { positional.push(arg); continue; }
    const at = arg.indexOf('=');
    const key = arg.slice(2, at < 0 ? undefined : at);
    const value = at < 0 ? true : arg.slice(at + 1);
    const allowed = [...FLAGS[cmd], 'json', ...(MUTATIONS[cmd] ? ['actor', 'dry-run'] : [])];
    if (!allowed.includes(key)) throw new Error(`Unknown flag --${key} for ${cmd}`);
    if (Object.hasOwn(opts, key)) throw new Error(`Repeated flag --${key}`);
    if (BOOLEAN.has(key) ? value !== true : value === true || value === '') throw new Error(`Invalid value for --${key}`);
    opts[key] = value;
  }
  if (cmd === 'import' ? positional.join(' ') !== 'mx-deposit' : positional.length) {
    throw new Error(cmd === 'import' ? 'Usage: import mx-deposit --dir=<unzipped export folder> --actor=NAME' : `Unexpected argument: ${positional[0]}`);
  }
  return { cmd, opts };
}

function help() {
  const line = (c) => `  ${c}${c === 'import' ? ' mx-deposit' : ''} ${FLAGS[c].map((f) => (BOOLEAN.has(f) ? `[--${f}]` : `--${f}=…`)).join(' ')}${MUTATIONS[c] ? ' --actor=NAME [--dry-run]' : ''} [--json]`;
  return ['Reads:', ...Object.keys(reads).map(line), ...Object.keys(OTHER).map(line), '', 'Changes:', ...Object.keys(MUTATIONS).map(line)].join('\n');
}

// ---------------------------------------------------------------- value checks

// YYYY-MM-DD, or DD/MM/YYYY as Australian and New Zealand exports write it.
const isoDate = (v, what = 'date') => {
  let s = String(v).trim();
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) s = `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  s = s.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`)) || new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) !== s) throw new Error(`Invalid ${what}: ${v} (use YYYY-MM-DD)`);
  return s;
};
const num = (v, what, { min = -Infinity, max = Infinity } = {}) => {
  const s = String(v).trim();
  if (!/^-?\d+(\.\d+)?$/.test(s) || Number(s) < min || Number(s) > max) throw new Error(`Invalid ${what}: ${v}`);
  return Number(s);
};
const posInt = (v, what) => {
  if (!/^\d+$/.test(String(v)) || Number(v) < 1) throw new Error(`Invalid ${what}: ${v}`);
  return Number(v);
};
const oneOf = (v, list, what) => {
  const s = String(v).trim();
  const hit = list.find((x) => x.toLowerCase() === s.toLowerCase());
  if (!hit) throw new Error(`Invalid ${what}: ${v} (one of ${list.join(', ')})`);
  return hit;
};
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const m = (v) => (v === null || v === undefined ? '' : Number(v).toString());

// Significant intercepts from one hole's samples (ordered, contiguous), length-weighted.
// A run starts and ends on a sample at or above the cut-off; up to `dilution` metres below
// the cut-off may sit inside it if the whole run still averages at or above the cut-off.
export function findIntercepts(samples, { cutoff, dilution = 0, minLength = 0 }) {
  const out = [];
  const grade = (s) => (s.value === null || s.value === undefined ? 0 : Number(s.value));
  let i = 0;
  while (i < samples.length) {
    if (grade(samples[i]) < cutoff) { i++; continue; }
    let end = i;
    let j = i + 1;
    let below = 0;
    while (j < samples.length && Number(samples[j].from_m) === Number(samples[j - 1].to_m)) {
      const s = samples[j];
      if (grade(s) >= cutoff) {
        const run = samples.slice(i, j + 1);
        const len = run.reduce((a, x) => a + (x.to_m - x.from_m), 0);
        const gm = run.reduce((a, x) => a + grade(x) * (x.to_m - x.from_m), 0);
        if (gm / len >= cutoff) { end = j; below = 0; } else break;
      } else {
        below += s.to_m - s.from_m;
        if (below > dilution) break;
      }
      j++;
    }
    const run = samples.slice(i, end + 1);
    const from = Number(run[0].from_m);
    const to = Number(run[run.length - 1].to_m);
    const len = to - from;
    const gm = run.reduce((a, x) => a + grade(x) * (x.to_m - x.from_m), 0);
    if (len >= minLength) out.push({ from_m: from, to_m: to, length_m: Number(len.toFixed(2)), grade: Number((gm / len).toFixed(2)), gram_metres: Number(gm.toFixed(1)), samples: run.length });
    i = end + 1;
  }
  return out;
}

// ---------------------------------------------------------------- main

async function main() {
  const { cmd, opts } = parseArgs(process.argv.slice(2));
  if (cmd === 'help') { console.log(help()); return; }

  const db = await getDb();
  const q = (sql, params = []) => db.query(sql, params);
  const one = async (sql, params = []) => (await q(sql, params))[0];
  const req = (k) => {
    if (typeof opts[k] !== 'string' || !opts[k].trim()) throw new Error(`Required: --${k}=…`);
    return opts[k].trim();
  };
  const opt = (k) => (typeof opts[k] === 'string' && opts[k].trim() ? opts[k].trim() : null);

  try {
    const today = (await one('select current_date::text as d')).d;
    const setting = async (k) => Number((await one('select value from settings where key = $1', [k]))?.value);

    // Partial id, exact name (case-insensitive) or, failing that, a name fragment. Ambiguous lists and fails.
    const resolve = async (tableName, s, label = tableName, extraCol = null) => {
      const sql = (where) => `select * from ${tableName} where ${where} order by name, id`;
      let rows = await q(sql(`id::text = lower($1) or lower(name) = lower($1) or starts_with(id::text, lower($1))${extraCol ? ` or lower(${extraCol}) = lower($1)` : ''}`), [s]);
      if (!rows.length) rows = await q(sql("lower(replace(name, ' ', '')) like '%' || lower(replace($1, ' ', '')) || '%'"), [s]);
      if (rows.length !== 1) throw new Error(rows.length ? `More than one ${label} matches "${s}": ${rows.map((r) => `${r.name} (${r.id.slice(0, 8)})`).join('; ')}` : `No ${label} matches "${s}"`);
      return rows[0];
    };
    const hole = (s = req('hole')) => resolve('holes', s, 'hole');
    const insert = async (t, obj) => {
      const keys = Object.keys(obj);
      return one(`insert into ${t} (${keys.join(', ')}) values (${keys.map((_, i) => `$${i + 1}`).join(', ')}) returning *`, Object.values(obj));
    };
    const update = async (t, row, obj) => {
      const keys = Object.keys(obj);
      return one(`update ${t} set ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')} where id = $${keys.length + 1} returning *`, [...Object.values(obj), row.id]);
    };
    const log = (action, before, after) =>
      q('insert into events (actor, action, record_id, before_record, after_record) values ($1, $2, $3, $4::jsonb, $5::jsonb)',
        [req('actor'), action, after?.id || before?.id || null, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null]);
    const on = (k = 'on') => (opt(k) ? isoDate(req(k), k) : today);
    const primarySamples = (holeId, element) => q(
      `select s.name, s.from_m::float8 as from_m, s.to_m::float8 as to_m, a.value::float8 as value, a.below_detection, a.units
       from samples s left join assays a on a.sample_id = s.id and lower(a.element) = lower($2)
       where s.hole_id = $1 and s.sample_type = 'primary' order by s.from_m`, [holeId, element]);
    const intercepts = async (holeRow, element, cutoff, dilution, minLength) => {
      const rows = await primarySamples(holeRow.id, element);
      const assayed = rows.filter((r) => r.value !== null || r.below_detection);
      return findIntercepts(assayed, { cutoff, dilution, minLength }).map((x) => ({
        hole: holeRow.name, ...x, units: assayed.find((r) => r.units)?.units || '',
        text: `${x.length_m} m @ ${x.grade} ${assayed.find((r) => r.units)?.units || ''} ${element} from ${x.from_m} m`,
      }));
    };

    let out;
    if (reads[cmd]) {
      out = await q(reads[cmd]);
    } else if (MUTATIONS[cmd]) {
      req('actor');
      await db.exec('BEGIN');
      try {
        out = await mutate(cmd);
        await db.exec(opts['dry-run'] ? 'ROLLBACK' : 'COMMIT');
      } catch (e) {
        await db.exec('ROLLBACK');
        throw e;
      }
    } else {
      out = await other(cmd);
    }
    if (opts['dry-run'] && out && !Array.isArray(out)) out = { ...out, preview: 'Preview only. Nothing was changed.' };
    print(out);

    // ---------------------------------------------------------------- read helpers

    async function other(c) {
      if (c === 'hole') {
        const h = await hole();
        return {
          hole: await q(`select hole, project, tenement, hole_type as type, status, planned_depth, max_depth, collar_method as collar, datum,
                           coalesce(started_on::text, '') as started_on, coalesce(completed_on::text, '') as completed_on,
                           coalesce(capped_on::text, '') as capped_on, coalesce(rehabilitated_on::text, '') as rehabilitated_on, metres_logged, metres_sampled
                         from hole_status where hole_id = $1`, [h.id]),
          collar: [{ easting: m(h.easting), northing: m(h.northing), rl: m(h.rl), datum: h.datum || '', zone: h.zone || '', method: h.collar_method, azimuth: m(h.azimuth), dip: m(h.dip) }],
          surveys: await q('select depth, azimuth, dip, method, coalesce(azimuth_ref, \'not stated\') as azimuth_ref from surveys where hole_id = $1 order by depth', [h.id]),
          logging: await q('select from_m, to_m, lith_code, coalesce(weathering, \'\') as weathering, coalesce(alteration, \'\') as alteration, description from logs where hole_id = $1 order by from_m', [h.id]),
          'sampling and results': await q(`select coalesce(d.name, '') as dispatch, count(*)::int as samples, min(s.from_m) as from_m, max(s.to_m) as to_m,
                                             count(a.id)::int as with_results from samples s left join dispatches d on d.id = s.dispatch_id
                                             left join assays a on a.sample_id = s.id
                                           where s.hole_id = $1 and s.sample_type = 'primary' group by d.name order by min(s.from_m)`, [h.id]),
          issues: await q('select rule, issue from compliance_issues where subject = $1 order by rule', [h.name]),
        };
      }
      if (c === 'samples') {
        const params = [];
        const where = [];
        if (opt('hole')) { params.push((await hole()).id); where.push(`s.hole_id = $${params.length}`); }
        if (opt('dispatch')) { params.push((await resolve('dispatches', req('dispatch'), 'dispatch')).id); where.push(`s.dispatch_id = $${params.length}`); }
        if (!where.length) throw new Error('Required: --hole=… or --dispatch=…');
        return q(`select s.name as sample, coalesce(h.name, '') as hole, s.from_m, s.to_m, s.sample_type as type,
                    coalesce(s.standard_name, p.name, '') as of, s.recovery_pct, coalesce(d.name, '') as dispatch,
                    (select count(*) from assays a where a.sample_id = s.id)::int as results
                  from samples s left join holes h on h.id = s.hole_id left join samples p on p.id = s.parent_id left join dispatches d on d.id = s.dispatch_id
                  where ${where.join(' and ')} order by s.name`, params);
      }
      if (c === 'assays') {
        const h = await hole();
        const element = opt('element') || 'Au';
        return (await primarySamples(h.id, element)).map((r) => ({
          sample: r.name, from_m: r.from_m, to_m: r.to_m,
          [element]: r.below_detection ? `<DL` : r.value === null ? 'pending' : r.value, units: r.units || '',
        }));
      }
      if (c === 'qaqc') {
        const params = [];
        let where = '';
        if (opt('dispatch')) { params.push((await resolve('dispatches', req('dispatch'), 'dispatch')).name); where = 'where dispatch = $1'; }
        return {
          standards: await q(`select sample, standard_name as standard, dispatch, element, value, certified_value, z, result from qc_standards ${where} order by dispatch, sample`, params),
          blanks: await q(`select sample, dispatch, element, value, detection_limit, result from qc_blanks ${where} order by dispatch, sample`, params),
          duplicates: await q(`select sample, original, dispatch, element, original_value, duplicate_value, diff_pct, result from qc_duplicates ${where} order by dispatch, sample`, params),
          'insertion rates': await q(`select dispatch, primaries, standards, standards_needed, blanks, blanks_needed, duplicates, duplicates_needed from qc_rates ${where} order by dispatch`, params),
        };
      }
      if (c === 'intercepts' || c === 'draft-announcement') {
        const element = opt('element') || 'Au';
        const cutoff = opt('cutoff') ? num(req('cutoff'), 'cut-off', { min: 0 }) : 0.5;
        const dilution = opt('dilution') ? num(req('dilution'), 'dilution', { min: 0 }) : 2;
        const minLength = opt('min-length') ? num(req('min-length'), 'minimum length', { min: 0 }) : 1;
        const holes = opt('hole') ? [await hole()] : await q("select * from holes where status in ('complete', 'abandoned', 'drilling') order by name");
        const rows = [];
        const noSig = [];
        const pendingHoles = [];
        const notSampled = [];
        for (const h of holes) {
          const hs = await one('select samples, awaiting_results, not_dispatched from hole_status where hole_id = $1', [h.id]);
          const found = await intercepts(h, element, cutoff, dilution, minLength);
          rows.push(...found);
          if (!found.length) (!hs.samples ? notSampled : hs.awaiting_results + hs.not_dispatched === hs.samples ? pendingHoles : noSig).push(h.name);
        }
        if (c === 'intercepts') return rows.map(({ text, ...r }) => r);
        const collars = await q(`select h.name as hole, h.hole_type as type, h.easting, h.northing, h.rl, h.datum, h.zone, h.azimuth, h.dip, h.max_depth
                                 from holes h where h.name = any($1) order by h.name`, [holes.map((h) => h.name)]);
        const qcFails = await q("select rule, subject, issue from compliance_issues where rule like 'QC_%' order by rule, subject");
        const md = [
          `# DRAFT: significant intercepts (${element}, ${cutoff} cut-off)`,
          '',
          `Prepared ${today} from the drillhole database. For the competent person to check before any release.`,
          '',
          `Intercepts are length-weighted at a ${cutoff} ${rows[0]?.units || ''} ${element} lower cut-off, with up to ${dilution} m of internal dilution and a minimum length of ${minLength} m.`,
          '',
          '| Hole | From (m) | To (m) | Length (m) | Grade | Gram-metres |',
          '|---|---|---|---|---|---|',
          ...rows.map((r) => `| ${r.hole} | ${r.from_m} | ${r.to_m} | ${r.length_m} | ${r.grade} ${r.units} ${element} | ${r.gram_metres} |`),
          '',
          noSig.length ? `No significant intercepts: ${noSig.join(', ')}.` : '',
          pendingHoles.length ? `Results pending: ${pendingHoles.join(', ')}.` : '',
          notSampled.length ? `Not yet sampled: ${notSampled.join(', ')}.` : '',
          '',
          '## Collars',
          '',
          '| Hole | Type | Easting | Northing | RL | Datum | Zone | Azimuth | Dip | Depth (m) |',
          '|---|---|---|---|---|---|---|---|---|---|',
          ...collars.map((h) => `| ${h.hole} | ${h.type} | ${m(h.easting)} | ${m(h.northing)} | ${m(h.rl)} | ${h.datum || ''} | ${h.zone || ''} | ${m(h.azimuth)} | ${m(h.dip)} | ${m(h.max_depth)} |`),
          '',
          '## QC to resolve before release',
          '',
          ...(qcFails.length ? qcFails.map((f) => `- ${f.rule} ${f.subject}: ${f.issue}`) : ['- None open.']),
          '',
        ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
        mkdirSync(path.resolve(process.env.OUTPUT_DIR || REPO_ROOT, 'drafts'), { recursive: true });
        const file = path.resolve(process.env.OUTPUT_DIR || REPO_ROOT, 'drafts', `intercepts-${slug(element)}-${today}.md`);
        writeFileSync(file, md + '\n');
        return { file, intercepts: rows.length, no_significant: noSig, pending: pendingHoles, not_sampled: notSampled, qc_open: qcFails.length, note: 'Draft only. Nothing was released.' };
      }
      if (c === 'draft-lab-chase') {
        const d = await resolve('dispatches', req('dispatch'), 'dispatch');
        const s = await one('select * from dispatch_status where dispatch_id = $1', [d.id]);
        const lab = await one('select * from labs where id = $1', [d.lab_id]);
        if (s.stage === 'results in') throw new Error(`${d.name} already has results (${s.results_on})`);
        const ask = s.stage === 'in transit'
          ? `<p>We sent batch ${esc(d.name)} (${esc(s.samples)} samples${d.consignment ? `, consignment ${esc(d.consignment)}` : ''}) on ${esc(d.sent_on)} and have not had your receipt. Could you confirm it arrived and that the sample count matches?</p>`
          : `<p>Batch ${esc(d.name)}${d.lab_job ? ` (your job ${esc(d.lab_job)})` : ''} reached you on ${esc(d.received_on)}, ${esc(s.days_in_stage)} days ago. Could you let us know when results are expected?</p>`;
        const file = writeOut('drafts', `lab-chase-${slug(d.name)}-${today}`, page({
          title: 'DRAFT: sample batch follow-up', subtitle: `${d.name}, ${lab.name}`,
          sections: [{ title: 'Email', html: `<p>To: ${esc(lab.email || '[lab email]')}</p><p>Hi ${esc(lab.name)} team,</p>${ask}<p>Thanks,<br>[Project geologist]</p>` }],
        }));
        return { file, dispatch: d.name, lab: lab.name, stage: s.stage, days: s.days_in_stage, note: 'Draft only. Nothing was sent.' };
      }
      if (c === 'attention') {
        return {
          compliance: await q(reads.compliance),
          'drilling now': await q("select hole, hole_type as type, max_depth as depth_so_far, planned_depth, started_on, contractor, rig from hole_status where status = 'drilling' order by hole"),
          'batches waiting': await q("select dispatch, lab, stage, days_in_stage, samples from dispatch_status where stage <> 'results in' order by days_in_stage desc"),
          'not dispatched': await q('select hole, not_dispatched as samples from hole_status where not_dispatched > 0 order by hole'),
          'reports due': await q("select tenement, due_on, state from tenement_reports where state in ('due', 'overdue') order by due_on"),
        };
      }
      if (c === 'weekly-review') {
        return {
          'drilled last 7 days': await q(`select name as hole, hole_type as type, status, max_depth as metres, coalesce(completed_on::text, '') as completed_on, coalesce(rig, '') as rig
                                          from holes where completed_on > current_date - 7 or status = 'drilling' order by name`),
          'results last 7 days': await q("select dispatch, lab, results_on, samples from dispatch_status where results_on > current_date - 7"),
          'batches waiting': await q("select dispatch, lab, stage, days_in_stage from dispatch_status where stage <> 'results in' order by days_in_stage desc"),
          'qc failures': await q("select rule, subject, issue from compliance_issues where rule like 'QC_%' order by rule, subject"),
          'reports due': await q("select tenement, due_on, state from tenement_reports where state in ('due', 'overdue') order by due_on"),
          'holes to rehabilitate': await q("select subject as hole, issue from compliance_issues where rule in ('HOLE_NOT_CAPPED', 'REHABILITATION') order by subject"),
          'compliance by rule': await q('select rule, count(*)::int as open from compliance_issues group by rule order by rule'),
        };
      }
      if (c === 'report-files') {
        const t = await resolve('tenements', req('tenement'), 'tenement');
        const tr = await one('select * from tenement_reports where tenement_id = $1', [t.id]);
        const p = await one('select * from projects where id = $1', [t.project_id]);
        const dir = path.resolve(req('out'));
        if (existsSync(dir)) throw new Error(`${dir} already exists. Choose a new folder.`);
        mkdirSync(dir, { recursive: true });
        const period = [String(tr.last_anniversary).slice(0, 10), `${Number(String(tr.last_anniversary).slice(0, 4)) - 1}${String(tr.last_anniversary).slice(4, 10)}`];
        const holeRows = await q(`select * from holes where tenement_id = $1 and completed_on > $2::date and completed_on <= $3::date order by name`, [t.id, period[1], period[0]]);
        const ids = holeRows.map((h) => h.id);
        const csv = (rows) => {
          if (!rows.length) return '';
          const cols = Object.keys(rows[0]);
          const cell = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
          return [cols.join(','), ...rows.map((r) => cols.map((k) => cell(r[k])).join(','))].join('\n') + '\n';
        };
        const header = [`# Tenement: ${t.name}`, `# Project: ${p.name}`, `# Reporting period: ${period[1]} to ${period[0]}`, `# Geodetic datum: ${p.datum}`, `# Projection: ${p.projection}`, `# Zone: ${p.zone}`, ''].join('\n');
        const files = {
          'collar.csv': await q(`select name as hole_id, hole_type, easting as mga_e, northing as mga_n, rl, datum, zone, collar_method, azimuth, dip, max_depth, completed_on from holes where id = any($1) order by name`, [ids]),
          'survey.csv': await q(`select h.name as hole_id, v.depth, v.azimuth, v.dip, v.method, coalesce(v.azimuth_ref, '') as azimuth_ref from surveys v join holes h on h.id = v.hole_id where h.id = any($1) order by h.name, v.depth`, [ids]),
          'geology.csv': await q(`select h.name as hole_id, l.from_m, l.to_m, l.lith_code, coalesce(l.weathering, '') as weathering, coalesce(l.alteration, '') as alteration, l.description from logs l join holes h on h.id = l.hole_id where h.id = any($1) order by h.name, l.from_m`, [ids]),
          'assay.csv': await q(`select h.name as hole_id, s.name as sample_id, s.from_m, s.to_m, a.element, case when a.below_detection then '<' || a.detection_limit else a.value::text end as value, a.units, coalesce(a.method, '') as method
                                from samples s join holes h on h.id = s.hole_id join assays a on a.sample_id = s.id where h.id = any($1) and s.sample_type = 'primary' order by h.name, s.from_m, a.element`, [ids]),
          'qaqc.csv': await q(`select s.name as sample_id, s.sample_type, coalesce(s.standard_name, p.name, '') as standard_or_original, coalesce(d.name, '') as dispatch, a.element,
                                 case when a.below_detection then '<' || a.detection_limit else a.value::text end as value, a.units
                               from samples s join assays a on a.sample_id = s.id left join samples p on p.id = s.parent_id left join dispatches d on d.id = s.dispatch_id
                               where s.sample_type <> 'primary' and s.dispatch_id in (select distinct dispatch_id from samples where hole_id = any($1)) order by s.name`, [ids]),
        };
        for (const [name, rows] of Object.entries(files)) writeFileSync(path.join(dir, name), header + csv(rows));
        const pending = await q(`select h.name from hole_status hs join holes h on h.id = hs.hole_id where h.id = any($1) and hs.awaiting_results + hs.not_dispatched > 0 order by h.name`, [ids]);
        return { dir, tenement: t.name, period_from: period[1], period_to: period[0], due_on: tr.due_on, holes: holeRows.length,
          files: Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v.length])),
          results_pending: pending.map((r) => r.name),
          note: 'Tables laid out for the annual report. Copy them into the department\'s templates, and send pending results with next year\'s report with the collar file.' };
      }
      if (c === 'export') {
        const file = path.resolve(req('out'));
        const data = { format: 'drillholes-archive-v1', created: new Date().toISOString(), records: {} };
        await db.exec('BEGIN ISOLATION LEVEL REPEATABLE READ');
        try {
          for (const t of ['settings', 'projects', 'tenements', 'reports', 'holes', 'surveys', 'logs', 'labs', 'standards', 'dispatches', 'samples', 'assays', 'events']) {
            data.records[t] = await q(`select * from ${t} order by 1`);
          }
          await db.exec('COMMIT');
        } catch (e) {
          await db.exec('ROLLBACK');
          throw e;
        }
        mkdirSync(path.dirname(file), { recursive: true });
        writeFileSync(file, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
        return { file, counts: Object.fromEntries(Object.entries(data.records).map(([k, v]) => [k, v.length])) };
      }
      throw new Error(`Unhandled command ${c}`);
    }

    // ---------------------------------------------------------------- changes

    async function mutate(c) {
      if (c === 'add-project') {
        const row = await insert('projects', { name: req('name'), code: req('code').toUpperCase(), commodity: opt('commodity') || '', datum: opt('datum') || 'GDA2020', projection: opt('projection') || 'MGA', zone: opt('zone') || '' });
        await log(c, null, row);
        return row;
      }
      if (c === 'add-tenement') {
        const p = await resolve('projects', req('project'), 'project', 'code');
        const row = await insert('tenements', {
          project_id: p.id, name: req('name'), jurisdiction: oneOf(opt('jurisdiction') || 'WA', ['WA', 'NSW', 'QLD', 'NT', 'SA', 'VIC', 'TAS', 'NZ'], 'jurisdiction'),
          holder: opt('holder') || '', granted_on: isoDate(req('granted'), 'grant date'), expires_on: opt('expires') ? isoDate(req('expires'), 'expiry date') : null,
        });
        await log(c, null, row);
        return row;
      }
      if (c === 'lodge-report') {
        const t = await resolve('tenements', req('tenement'), 'tenement');
        const tr = await one('select * from tenement_reports where tenement_id = $1', [t.id]);
        const kind = oneOf(opt('kind') || 'annual', ['annual', 'partial-surrender', 'surrender'], 'kind');
        const periodEnd = opt('period-end') ? isoDate(req('period-end'), 'period end') : String(tr?.last_anniversary || '').slice(0, 10);
        if (!periodEnd) throw new Error('Required: --period-end=YYYY-MM-DD');
        const row = await insert('reports', { tenement_id: t.id, kind, period_end: periodEnd, lodged_on: on(), reference: opt('reference') });
        await log(c, null, row);
        return row;
      }
      if (c === 'plan-hole') {
        const p = await resolve('projects', req('project'), 'project', 'code');
        const t = opt('tenement') ? await resolve('tenements', req('tenement'), 'tenement') : null;
        if (t && t.project_id !== p.id) throw new Error(`${t.name} is not on project ${p.code}`);
        const row = await insert('holes', {
          project_id: p.id, tenement_id: t?.id || null, name: req('name').toUpperCase(), hole_type: oneOf(req('type'), ['RC', 'DD', 'RCDD', 'AC', 'RAB'], 'hole type'),
          planned_depth: opt('depth') ? num(req('depth'), 'depth', { min: 0 }) : null,
          easting: opt('easting') ? num(req('easting'), 'easting') : null, northing: opt('northing') ? num(req('northing'), 'northing') : null,
          datum: p.datum, zone: p.zone || null, collar_method: 'planned',
          azimuth: opt('azimuth') ? num(req('azimuth'), 'azimuth', { min: 0, max: 359.99 }) : null, dip: opt('dip') ? num(req('dip'), 'dip', { min: -90, max: 90 }) : null,
        });
        await log(c, null, row);
        return row;
      }
      if (c === 'start-hole') {
        const h = await hole();
        if (h.status !== 'planned') throw new Error(`${h.name} is ${h.status}, not planned`);
        const row = await update('holes', h, { status: 'drilling', started_on: on(), contractor: opt('contractor') || h.contractor, rig: opt('rig') || h.rig, max_depth: 0 });
        await log(c, h, row);
        return row;
      }
      if (c === 'complete-hole' || c === 'abandon-hole') {
        const h = await hole();
        if (!['drilling', 'planned'].includes(h.status)) throw new Error(`${h.name} is already ${h.status}`);
        const depth = num(req('depth'), 'depth', { min: 0.1 });
        const deepest = await one(`select greatest(coalesce((select max(to_m) from logs where hole_id = $1), 0), coalesce((select max(to_m) from samples where hole_id = $1), 0), coalesce((select max(depth) from surveys where hole_id = $1), 0)) as d`, [h.id]);
        if (Number(deepest.d) > depth) throw new Error(`${h.name} has logging, samples or surveys to ${deepest.d} m, deeper than ${depth} m`);
        const row = await update('holes', h, {
          status: c === 'complete-hole' ? 'complete' : 'abandoned', max_depth: depth, completed_on: on(), started_on: h.started_on || on(),
          note: c === 'abandon-hole' ? opt('note') || h.note : h.note,
        });
        await log(c, h, row);
        return row;
      }
      if (c === 'survey-collar') {
        const h = await hole();
        const p = await one('select * from projects where id = $1', [h.project_id]);
        const row = await update('holes', h, {
          easting: num(req('easting'), 'easting'), northing: num(req('northing'), 'northing'), rl: opt('rl') ? num(req('rl'), 'RL') : h.rl,
          collar_method: oneOf(req('method'), ['GPS', 'DGPS', 'RTK', 'total station'], 'survey method'),
          datum: opt('datum') || p.datum, zone: opt('zone') || h.zone || p.zone || null,
        });
        await log(c, h, row);
        return row;
      }
      if (c === 'add-survey') {
        const h = await hole();
        const depth = num(req('depth'), 'depth', { min: 0 });
        if (h.max_depth !== null && h.status !== 'drilling' && depth > Number(h.max_depth)) throw new Error(`${h.name} ends at ${h.max_depth} m`);
        const row = await insert('surveys', {
          hole_id: h.id, depth, azimuth: num(req('azimuth'), 'azimuth', { min: 0, max: 359.99 }), dip: num(req('dip'), 'dip', { min: -90, max: 90 }),
          method: opt('method') || 'gyro', azimuth_ref: oneOf(req('ref'), ['true', 'magnetic', 'grid'], 'azimuth reference'),
        });
        await log(c, null, row);
        return row;
      }
      if (c === 'log-interval') {
        const h = await hole();
        const from = num(req('from'), 'from', { min: 0 });
        const to = num(req('to'), 'to', { min: 0 });
        if (to <= from) throw new Error('--to must be deeper than --from');
        if (h.max_depth !== null && h.status !== 'drilling' && to > Number(h.max_depth)) throw new Error(`${h.name} ends at ${h.max_depth} m`);
        const clash = await one('select from_m, to_m, lith_code from logs where hole_id = $1 and from_m < $3 and to_m > $2 order by from_m limit 1', [h.id, from, to]);
        if (clash) throw new Error(`${h.name} is already logged ${clash.from_m}-${clash.to_m} m as ${clash.lith_code}`);
        const row = await insert('logs', {
          hole_id: h.id, from_m: from, to_m: to, lith_code: req('lith').toUpperCase(), weathering: opt('weathering'), alteration: opt('alteration'),
          description: opt('description') || '', logged_by: opt('by') || req('actor'), logged_on: on(),
        });
        await log(c, null, row);
        return row;
      }
      if (c === 'sample-hole') {
        // The sample sheet: one ticket per interval, with a standard, blank or duplicate every Nth ticket.
        const h = await hole();
        const from = num(req('from'), 'from', { min: 0 });
        const to = num(req('to'), 'to', { min: 0 });
        const step = opt('interval') ? num(req('interval'), 'interval', { min: 0.1 }) : 1;
        if (to <= from) throw new Error('--to must be deeper than --from');
        if (h.max_depth !== null && h.status !== 'drilling' && to > Number(h.max_depth)) throw new Error(`${h.name} ends at ${h.max_depth} m`);
        const clash = await one("select name, from_m, to_m from samples where hole_id = $1 and sample_type = 'primary' and from_m < $3 and to_m > $2 limit 1", [h.id, from, to]);
        if (clash) throw new Error(`${h.name} is already sampled ${clash.from_m}-${clash.to_m} m (${clash.name})`);
        const prefix = req('prefix').toUpperCase();
        let n = posInt(req('start'), 'start number');
        const width = Math.max(String(n).length, 5);
        const stds = opt('standards') ? opt('standards').split(',').map((s) => s.trim()).filter(Boolean) : [];
        for (const s of stds) if (!(await one("select 1 from standards where name = $1 and kind = 'standard'", [s]))) throw new Error(`No standard named ${s}. Add it with add-standard.`);
        const blank = opt('blank');
        if (blank && !(await one("select 1 from standards where name = $1 and kind = 'blank'", [blank]))) throw new Error(`No blank named ${blank}. Add it with add-standard --kind=blank.`);
        const everyStd = await setting('qc_standard_every');
        const everyBlank = await setting('qc_blank_every');
        const everyDup = await setting('qc_duplicate_every');
        const wantDups = opt('duplicates') ? oneOf(req('duplicates'), ['yes', 'no'], 'duplicates') === 'yes' : true;
        const counts = { primary: 0, standard: 0, blank: 0, duplicate: 0 };
        const ticket = () => `${prefix}${String(n++).padStart(width, '0')}`;
        const add = async (obj) => {
          if (await one('select 1 from samples where name = $1', [obj.name])) throw new Error(`Sample number ${obj.name} is already used`);
          const row = await insert('samples', obj);
          counts[obj.sample_type]++;
          await log(c, null, row);
          return row;
        };
        let k = 0;
        for (let d = from; d < to - 1e-9; d = Number((d + step).toFixed(3))) {
          const end = Math.min(Number((d + step).toFixed(3)), to);
          const prim = await add({ name: ticket(), hole_id: h.id, from_m: d, to_m: end, sample_type: 'primary' });
          k++;
          if (stds.length && k % everyStd === 0) await add({ name: ticket(), hole_id: h.id, sample_type: 'standard', standard_name: stds[(k / everyStd - 1) % stds.length] });
          if (blank && k % everyBlank === 0) await add({ name: ticket(), hole_id: h.id, sample_type: 'blank', standard_name: blank });
          if (wantDups && k % everyDup === 0) await add({ name: ticket(), hole_id: h.id, from_m: d, to_m: end, sample_type: 'duplicate', parent_id: prim.id });
        }
        return { hole: h.name, from_m: from, to_m: to, interval_m: step, ...counts, last_ticket: `${prefix}${String(n - 1).padStart(width, '0')}` };
      }
      if (c === 'add-qc') {
        const h = opt('hole') ? await hole() : null;
        const kind = oneOf(req('kind'), ['standard', 'blank', 'duplicate'], 'kind');
        let row;
        if (kind === 'duplicate') {
          const parent = await resolve('samples', req('of'), 'sample');
          if (parent.sample_type !== 'primary') throw new Error(`${parent.name} is a ${parent.sample_type}, not a primary sample`);
          row = await insert('samples', { name: req('name').toUpperCase(), hole_id: parent.hole_id, from_m: parent.from_m, to_m: parent.to_m, sample_type: 'duplicate', parent_id: parent.id });
        } else {
          const std = req('standard');
          if (!(await one('select 1 from standards where name = $1 and kind = $2', [std, kind]))) throw new Error(`No ${kind} named ${std}`);
          row = await insert('samples', { name: req('name').toUpperCase(), hole_id: h?.id || null, sample_type: kind, standard_name: std });
        }
        await log(c, null, row);
        return row;
      }
      if (c === 'set-recovery') {
        const h = await hole();
        const pct = num(req('pct'), 'recovery', { min: 0, max: 100 });
        const rows = await q(`update samples set recovery_pct = $4 where hole_id = $1 and sample_type in ('primary', 'duplicate') and from_m >= $2 and to_m <= $3 returning *`,
          [h.id, num(req('from'), 'from', { min: 0 }), num(req('to'), 'to', { min: 0 }), pct]);
        if (!rows.length) throw new Error(`No samples on ${h.name} in that range`);
        for (const r of rows) await log(c, null, r);
        return { hole: h.name, samples_updated: rows.length, recovery_pct: pct };
      }
      if (c === 'add-standard') {
        const kind = oneOf(opt('kind') || 'standard', ['standard', 'blank'], 'kind');
        const row = await insert('standards', {
          name: req('name'), kind, element: req('element'), certified_value: kind === 'blank' ? (opt('value') ? num(req('value'), 'value', { min: 0 }) : 0) : num(req('value'), 'certified value', { min: 0 }),
          sd: kind === 'blank' ? null : num(req('sd'), 'standard deviation', { min: 0.0000001 }), units: req('units'),
        });
        await log(c, null, row);
        return row;
      }
      if (c === 'add-lab') {
        const row = await insert('labs', { name: req('name'), code: req('code').toUpperCase(), email: opt('email') });
        await log(c, null, row);
        return row;
      }
      if (c === 'dispatch') {
        const lab = await resolve('labs', req('lab'), 'lab', 'code');
        const ids = [];
        if (opt('hole')) {
          const h = await hole();
          ids.push(...(await q('select id from samples where hole_id = $1 and dispatch_id is null order by name', [h.id])).map((r) => r.id));
        }
        if (opt('samples')) {
          for (const part of req('samples').split(',').map((s) => s.trim()).filter(Boolean)) {
            const [a, b] = part.split('-').map((s) => s.trim().toUpperCase());
            const rows = b
              ? await q('select id, dispatch_id, name from samples where name between $1 and $2 and length(name) = length($1) order by name', [a, b])
              : await q('select id, dispatch_id, name from samples where name = $1', [a]);
            if (!rows.length) throw new Error(`No samples match ${part}`);
            const taken = rows.find((r) => r.dispatch_id);
            if (taken) throw new Error(`${taken.name} is already in a batch`);
            ids.push(...rows.map((r) => r.id));
          }
        }
        const unique = [...new Set(ids)];
        if (!unique.length) throw new Error('Nothing to dispatch: give --hole=… or --samples=FROM-TO with samples not yet sent');
        const d = await insert('dispatches', { name: req('name').toUpperCase(), lab_id: lab.id, sent_on: on(), consignment: opt('consignment') });
        await q('update samples set dispatch_id = $1 where id = any($2)', [d.id, unique]);
        await log(c, null, d);
        const status = await one('select * from qc_rates where dispatch_id = $1', [d.id]);
        const short = status.standards < status.standards_needed || status.blanks < status.blanks_needed || status.duplicates < status.duplicates_needed;
        return { dispatch: d.name, lab: lab.name, sent_on: d.sent_on, samples: unique.length, primaries: status.primaries, standards: status.standards, blanks: status.blanks, duplicates: status.duplicates,
          ...(short ? { warning: `Below the house QC rate: needs ${status.standards_needed} standards, ${status.blanks_needed} blanks and ${status.duplicates_needed} duplicates` } : {}) };
      }
      if (c === 'receive') {
        const d = await resolve('dispatches', req('dispatch'), 'dispatch');
        if (d.received_on) throw new Error(`${d.name} was received on ${d.received_on}`);
        const row = await update('dispatches', d, { received_on: on(), lab_job: opt('job') || d.lab_job });
        await log(c, d, row);
        return row;
      }
      if (c === 'cap-hole' || c === 'rehab-hole') {
        const h = await hole();
        if (!['complete', 'abandoned'].includes(h.status)) throw new Error(`${h.name} is ${h.status}; finish or abandon it first`);
        const date = on();
        if (date < String(h.completed_on).slice(0, 10)) throw new Error(`${h.name} was completed on ${h.completed_on}`);
        const row = await update('holes', h, c === 'cap-hole' ? { capped_on: date } : { rehabilitated_on: date, capped_on: h.capped_on || date });
        await log(c, h, row);
        return row;
      }
      if (c === 'set') {
        const key = req('key');
        const before = await one('select * from settings where key = $1', [key]);
        if (!before) throw new Error(`No setting ${key}. Run: npm run dh -- settings`);
        num(req('value'), key, { min: 0 });
        const row = await one('update settings set value = $2 where key = $1 returning *', [key, req('value')]);
        await q('insert into events (actor, action, before_record, after_record) values ($1, $2, $3::jsonb, $4::jsonb)', [req('actor'), c, JSON.stringify(before), JSON.stringify(row)]);
        return row;
      }
      if (c === 'load-results') return loadResults();
      if (c === 'import') return importMxDeposit();
      throw new Error(`Unhandled command ${c}`);
    }

    // ---------------------------------------------------------------- lab results

    // A lab results file saved as CSV: one row per sample, a sample column, then one column per
    // element headed "Au", "Au_ppm", "Au (g/t)" or "Au_gpt". "<0.01" and "-0.01" are below detection.
    async function loadResults() {
      const rows = parseCsv(readFileSync(path.resolve(req('file')), 'utf8'));
      if (!rows.length) throw new Error('The file has no rows');
      const d = opt('dispatch') ? await resolve('dispatches', req('dispatch'), 'dispatch') : null;
      const cols = Object.keys(rows[0]);
      const sampleCol = cols.find((k) => /^(sample(\s*(id|no|number))?|sampleid|sample_id)$/i.test(k.trim()));
      if (!sampleCol) throw new Error('No sample column (Sample, SampleID or Sample_ID)');
      const unitsOf = (u) => ({ ppm: 'ppm', ppb: 'ppb', gpt: 'g/t', 'g/t': 'g/t', pct: '%', '%': '%' }[String(u || '').toLowerCase()] || null);
      const elements = cols.filter((k) => k !== sampleCol).map((k) => {
        const mm = k.trim().match(/^([A-Z][a-z]?)(?:[\s_]*\(?\s*(ppm|ppb|gpt|g\/t|pct|%)\s*\)?)?$/);
        return mm ? { col: k, element: mm[1], units: unitsOf(mm[2]) } : null;
      }).filter(Boolean);
      if (!elements.length) throw new Error('No element columns found (headed like Au_ppm or Cu (%))');
      const summary = { results_added: 0, results_updated: 0, below_detection: 0, samples: 0 };
      const method = opt('method');
      const date = on();
      for (const [i, r] of rows.entries()) {
        const name = pick(r, sampleCol).trim().toUpperCase();
        if (!name) continue;
        const s = await one('select * from samples where name = $1', [name]);
        if (!s) throw new Error(`Row ${i + 2}: no sample ${name} on file`);
        if (d && s.dispatch_id !== d.id) throw new Error(`Row ${i + 2}: ${name} is not in batch ${d.name}`);
        summary.samples++;
        for (const e of elements) {
          const raw = String(r[e.col] ?? '').trim();
          if (!raw || /^(n\.?s\.?|is|lns|x)$/i.test(raw)) continue;
          let value = null;
          let below = false;
          let dl = null;
          if (/^<\s*\d/.test(raw)) { below = true; dl = num(raw.replace(/^<\s*/, ''), `row ${i + 2} ${e.col}`); }
          else if (/^-\d/.test(raw)) { below = true; dl = Math.abs(num(raw, `row ${i + 2} ${e.col}`)); }
          else value = num(raw, `row ${i + 2} ${e.col}`, { min: 0 });
          if (below) summary.below_detection++;
          const units = e.units || (await one('select units from standards where element = $1 limit 1', [e.element]))?.units || 'ppm';
          const before = await one('select * from assays where sample_id = $1 and element = $2', [s.id, e.element]);
          const fields = { value, below_detection: below, detection_limit: dl ?? before?.detection_limit ?? null, units, method: method || before?.method || null, lab_job: d?.lab_job || before?.lab_job || null, reported_on: date };
          if (before) { const row = await update('assays', before, fields); summary.results_updated++; await log('load-results', before, row); }
          else { const row = await insert('assays', { sample_id: s.id, element: e.element, ...fields }); summary.results_added++; await log('load-results', null, row); }
        }
      }
      if (d) {
        const left = await one('select count(*)::int as n from samples s where s.dispatch_id = $1 and not exists (select 1 from assays a where a.sample_id = s.id)', [d.id]);
        if (!left.n) await update('dispatches', d, { received_on: d.received_on || date, results_on: date });
        summary.batch = d.name;
        summary.batch_complete = !left.n;
        summary.still_waiting = left.n;
      }
      const fails = await q("select rule, subject, issue from compliance_issues where rule like 'QC_%' order by rule, subject");
      return { ...summary, elements: elements.map((e) => e.element), qc_failures: fails };
    }

    // ---------------------------------------------------------------- MX Deposit import

    // An MX Deposit export, unzipped: one CSV per table with headers as they appear in MX Deposit.
    // collar.csv is required; survey.csv, lithology.csv, samples.csv and assays.csv come across if present.
    // Headers differ between configurations, so other headings come in with --map.
    async function importMxDeposit() {
      const dir = path.resolve(req('dir'));
      const p = await resolve('projects', req('project'), 'project', 'code');
      const defaults = {
        collar_file: 'collar.csv', survey_file: 'survey.csv', lith_file: 'lithology.csv', sample_file: 'samples.csv', assay_file: 'assays.csv',
        hole: 'Hole ID', type: 'Hole Type', status: 'Hole Status', easting: 'Easting', northing: 'Northing', rl: 'Elevation', datum: 'Datum', collar_method: 'Survey Method',
        azimuth: 'Azimuth', dip: 'Dip', depth: 'Final Depth', planned_depth: 'Planned Depth', started: 'Start Date', completed: 'End Date', tenement: 'Tenement', contractor: 'Drilling Company', rig: 'Rig',
        survey_depth: 'Depth', survey_azimuth: 'Azimuth', survey_dip: 'Dip', survey_method: 'Survey Type', survey_ref: 'Azimuth Reference',
        from: 'From', to: 'To', lith: 'Lithology', weathering: 'Weathering', alteration: 'Alteration', comments: 'Comments', logged_by: 'Logged By',
        sample: 'Sample ID', sample_type: 'Sample Type', parent: 'Parent Sample', standard: 'Standard ID', recovery: 'Recovery %', weight: 'Weight (kg)', dispatch: 'Dispatch ID',
        element: 'Element', value: 'Value', units: 'Units', method: 'Method', lab: 'Lab',
      };
      const mapping = opts.map ? JSON.parse(readFileSync(path.resolve(req('map')), 'utf8')) : {};
      for (const [k, v] of Object.entries(mapping)) if (!Object.hasOwn(defaults, k) || typeof v !== 'string' || !v) throw new Error(`Invalid mapping entry: ${k}`);
      const cols = { ...defaults, ...mapping };
      const load = (k, required = false) => {
        const file = path.join(dir, cols[k]);
        if (!existsSync(file)) { if (required) throw new Error(`Missing ${cols[k]} in ${dir}`); return []; }
        return parseCsv(readFileSync(file, 'utf8'));
      };
      const summary = { holes_added: 0, holes_unchanged: 0, surveys_added: 0, intervals_added: 0, samples_added: 0, results_added: 0, tenements_missing: [] };
      const holeIds = new Map();
      const typeOf = (v) => { const s = String(v).toUpperCase().replace(/[^A-Z]/g, ''); return ['RC', 'DD', 'RCDD', 'AC', 'RAB'].includes(s) ? s : s === 'DDH' || s === 'DIAMOND' ? 'DD' : s === 'AIRCORE' ? 'AC' : 'RC'; };
      const statusOf = (v, completed) => { const s = String(v).toLowerCase(); return /abandon/.test(s) ? 'abandoned' : /plan/.test(s) ? 'planned' : /progress|drilling|active/.test(s) ? 'drilling' : completed ? 'complete' : 'planned'; };
      const methodOf = (v) => { const s = String(v).toUpperCase(); return /RTK/.test(s) ? 'RTK' : /DGPS|DIFF/.test(s) ? 'DGPS' : /TOTAL|STATION/.test(s) ? 'total station' : /GPS/.test(s) ? 'GPS' : 'planned'; };
      const n = (v, what) => (String(v ?? '').trim() === '' ? null : num(String(v).trim(), what));
      for (const [i, r] of load('collar_file', true).entries()) {
        const at = `collar row ${i + 2}`;
        const name = pick(r, cols.hole).trim().toUpperCase();
        if (!name) throw new Error(`${at}: missing ${cols.hole}`);
        const existing = await one('select id from holes where name = $1', [name]);
        if (existing) { holeIds.set(name, existing.id); summary.holes_unchanged++; continue; }
        let tenementId = null;
        const tn = pick(r, cols.tenement).trim();
        if (tn) {
          const t = await one("select id from tenements where lower(replace(name, ' ', '')) = lower(replace($1, ' ', ''))", [tn]);
          if (t) tenementId = t.id; else if (!summary.tenements_missing.includes(tn)) summary.tenements_missing.push(tn);
        }
        const completed = pick(r, cols.completed) ? isoDate(pick(r, cols.completed), `${at} end date`) : null;
        const status = statusOf(pick(r, cols.status), completed);
        const row = await insert('holes', {
          project_id: p.id, tenement_id: tenementId, name, hole_type: typeOf(pick(r, cols.type)), status,
          planned_depth: n(pick(r, cols.planned_depth), `${at} planned depth`), max_depth: n(pick(r, cols.depth), `${at} depth`),
          easting: n(pick(r, cols.easting), `${at} easting`), northing: n(pick(r, cols.northing), `${at} northing`), rl: n(pick(r, cols.rl), `${at} elevation`),
          datum: pick(r, cols.datum).trim() || p.datum, zone: p.zone || null, collar_method: methodOf(pick(r, cols.collar_method)),
          azimuth: n(pick(r, cols.azimuth), `${at} azimuth`), dip: n(pick(r, cols.dip), `${at} dip`),
          contractor: pick(r, cols.contractor) || null, rig: pick(r, cols.rig) || null,
          started_on: pick(r, cols.started) ? isoDate(pick(r, cols.started), `${at} start date`) : null, completed_on: status === 'planned' || status === 'drilling' ? null : completed,
          source_ref: `mx:hole:${name}`,
        });
        holeIds.set(name, row.id);
        summary.holes_added++;
        await log('import-mx-deposit', null, row);
      }
      const holeFor = async (r, at) => {
        const name = pick(r, cols.hole).trim().toUpperCase();
        if (holeIds.has(name)) return holeIds.get(name);
        const h = await one('select id from holes where name = $1', [name]);
        if (!h) throw new Error(`${at}: hole ${name || '(blank)'} is not in collar.csv or on file`);
        holeIds.set(name, h.id);
        return h.id;
      };
      for (const [i, r] of load('survey_file').entries()) {
        const at = `survey row ${i + 2}`;
        const ref = pick(r, cols.survey_ref).toLowerCase();
        const row = await one(`insert into surveys (hole_id, depth, azimuth, dip, method, azimuth_ref) values ($1, $2, $3, $4, $5, $6) on conflict (hole_id, depth) do nothing returning *`,
          [await holeFor(r, at), n(pick(r, cols.survey_depth), `${at} depth`), n(pick(r, cols.survey_azimuth), `${at} azimuth`), n(pick(r, cols.survey_dip), `${at} dip`),
           pick(r, cols.survey_method) || 'unknown', /true|gyro/.test(ref) ? 'true' : /mag/.test(ref) ? 'magnetic' : /grid/.test(ref) ? 'grid' : null]);
        if (row) { summary.surveys_added++; await log('import-mx-deposit', null, row); }
      }
      for (const [i, r] of load('lith_file').entries()) {
        const at = `lithology row ${i + 2}`;
        const hid = await holeFor(r, at);
        const from = n(pick(r, cols.from), `${at} from`);
        const to = n(pick(r, cols.to), `${at} to`);
        if (await one('select 1 from logs where hole_id = $1 and from_m = $2 and to_m = $3', [hid, from, to])) continue;
        const row = await insert('logs', { hole_id: hid, from_m: from, to_m: to, lith_code: (pick(r, cols.lith) || 'UNK').toUpperCase(), weathering: pick(r, cols.weathering) || null, alteration: pick(r, cols.alteration) || null, description: pick(r, cols.comments) || '', logged_by: pick(r, cols.logged_by) || null });
        summary.intervals_added++;
        await log('import-mx-deposit', null, row);
      }
      const sampleRows = load('sample_file');
      const ordered = [...sampleRows.entries()].sort(([, a], [, b]) => (/dup/i.test(pick(a, cols.sample_type)) ? 1 : 0) - (/dup/i.test(pick(b, cols.sample_type)) ? 1 : 0));
      for (const [i, r] of ordered) {
        const at = `samples row ${i + 2}`;
        const name = pick(r, cols.sample).trim().toUpperCase();
        if (!name) throw new Error(`${at}: missing ${cols.sample}`);
        if (await one('select 1 from samples where name = $1', [name])) continue;
        const t = pick(r, cols.sample_type).toLowerCase();
        const type = /dup/.test(t) ? 'duplicate' : /blank/.test(t) ? 'blank' : /std|standard|crm/.test(t) ? 'standard' : 'primary';
        let dispatchId = null;
        const dn = pick(r, cols.dispatch).trim().toUpperCase();
        if (dn) {
          let d = await one('select id from dispatches where name = $1', [dn]);
          if (!d) {
            const labName = pick(r, cols.lab).trim() || 'Unknown lab';
            let lab = await one('select id from labs where lower(name) = lower($1)', [labName]);
            if (!lab) lab = await insert('labs', { name: labName, code: labName.replace(/[^A-Za-z]/g, '').slice(0, 6).toUpperCase() || 'LAB' });
            d = await insert('dispatches', { name: dn, lab_id: lab.id, sent_on: today });
            summary.dispatch_dates_set_to_today = (summary.dispatch_dates_set_to_today || 0) + 1;
          }
          dispatchId = d.id;
        }
        const parent = type === 'duplicate' ? await one('select * from samples where name = $1', [pick(r, cols.parent).trim().toUpperCase()]) : null;
        if (type === 'duplicate' && !parent) throw new Error(`${at}: duplicate ${name} has no parent sample on file`);
        const qc = type === 'standard' || type === 'blank';
        const row = await insert('samples', {
          name, sample_type: type, dispatch_id: dispatchId, parent_id: parent?.id || null,
          hole_id: pick(r, cols.hole) ? await holeFor(r, at) : parent?.hole_id || null,
          from_m: qc ? null : n(pick(r, cols.from), `${at} from`) ?? parent?.from_m ?? null, to_m: qc ? null : n(pick(r, cols.to), `${at} to`) ?? parent?.to_m ?? null,
          standard_name: type === 'standard' || type === 'blank' ? pick(r, cols.standard) || 'UNKNOWN' : null,
          recovery_pct: n(pick(r, cols.recovery), `${at} recovery`), weight_kg: n(pick(r, cols.weight), `${at} weight`), source_ref: `mx:sample:${name}`,
        });
        summary.samples_added++;
        await log('import-mx-deposit', null, row);
      }
      for (const [i, r] of load('assay_file').entries()) {
        const at = `assays row ${i + 2}`;
        const s = await one('select id from samples where name = $1', [pick(r, cols.sample).trim().toUpperCase()]);
        if (!s) throw new Error(`${at}: no sample ${pick(r, cols.sample)} on file`);
        const raw = pick(r, cols.value).trim();
        const below = /^[<-]/.test(raw);
        const row = await one(`insert into assays (sample_id, element, value, below_detection, detection_limit, units, method) values ($1, $2, $3, $4, $5, $6, $7) on conflict (sample_id, element) do nothing returning *`,
          [s.id, pick(r, cols.element), below ? null : num(raw, `${at} value`, { min: 0 }), below, below ? Math.abs(num(raw.replace(/^</, ''), `${at} value`)) : null, pick(r, cols.units) || 'ppm', pick(r, cols.method) || null]);
        if (row) { summary.results_added++; await log('import-mx-deposit', null, row); }
      }
      return {
        ...summary,
        notice: 'Holes, surveys, logging, samples and results come across. Batches named in the samples file are created with today as the sent date: set the real dates on each. Standards named in the samples file need their certified values added with add-standard before QC checks run.',
      };
    }
  } finally {
    await db.close();
  }

  // ---------------------------------------------------------------- output

  function print(value) {
    if (opts.json) { console.log(JSON.stringify(value, null, 2)); return; }
    const show = (rows) => {
      if (!rows.length) return '  (none)';
      return textTable(rows, Object.keys(rows[0]).map((k) => ({
        key: k, label: k, width: 70,
        format: (v) => (v === null || v === undefined ? '' : v instanceof Date ? v.toISOString().slice(0, 16).replace('T', ' ') : Array.isArray(v) ? (v.length && typeof v[0] === 'object' ? `${v.length} item(s)` : v.join(', ')) : typeof v === 'object' ? JSON.stringify(v) : v),
      })));
    };
    if (Array.isArray(value)) console.log(show(value));
    else if (value && Object.values(value).every(Array.isArray)) for (const [k, v] of Object.entries(value)) console.log(`\n${k}\n${show(v)}`);
    else console.log(show([value]));
  }
}

if (/drillholes\.mjs$/.test(process.argv[1] || '')) {
  main().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
}
