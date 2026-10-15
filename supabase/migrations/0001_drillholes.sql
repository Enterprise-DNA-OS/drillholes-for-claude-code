-- Drillhole Data for Claude Code: projects, tenements, collars, downhole surveys, logging,
-- samples with their QC inserts, lab dispatches, assays and tenement reports.
-- Plain Postgres. Runs on any Postgres 13+ and on the embedded PGlite.

create table if not exists settings (
  key text primary key,
  value text not null,
  note text not null default ''
);

insert into settings (key, value, note) values
  ('report_due_days', '60', 'Days after each tenement anniversary that the annual mineral exploration report is due (WA guidelines: no later than 60 days). Change it for other states.'),
  ('report_notice_days', '45', 'Flag a tenement report this many days before it is due.'),
  ('rehab_days', '180', 'Days after a hole is completed to finish rehabilitation (the standard WA tenement condition is 6 months).'),
  ('dispatch_receipt_days', '7', 'Days after dispatch to get the lab''s receipt of the samples (chain of custody).'),
  ('results_due_days', '21', 'Days after the lab receives a batch that results are expected.'),
  ('standard_warn_sd', '2', 'A standard more than this many standard deviations from its certified value is a warning.'),
  ('standard_fail_sd', '3', 'A standard more than this many standard deviations from its certified value fails.'),
  ('blank_fail_multiple', '5', 'A blank above this many times the detection limit fails.'),
  ('duplicate_fail_pct', '30', 'A field duplicate whose relative difference from its original is above this percentage fails.'),
  ('qc_standard_every', '20', 'One certified standard for every this many primary samples in a batch.'),
  ('qc_blank_every', '40', 'One blank for every this many primary samples in a batch.'),
  ('qc_duplicate_every', '20', 'One field duplicate for every this many primary samples in a batch.'),
  ('downhole_survey_min_depth', '30', 'Holes deeper than this many metres need at least one downhole survey.')
on conflict (key) do nothing;

create or replace function setting_num(k text) returns numeric language sql stable as
$$ select value::numeric from settings where key = k $$;

create or replace function touch_updated_at() returns trigger language plpgsql as
$$ begin new.updated_at = now(); return new; end $$;

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text not null unique,
  commodity text not null default '',
  datum text not null default 'GDA2020',
  projection text not null default 'MGA',
  zone text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tenements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id),
  name text not null unique,
  jurisdiction text not null default 'WA',
  holder text not null default '',
  granted_on date not null,
  expires_on date,
  status text not null default 'live' check (status in ('live', 'surrendered', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  tenement_id uuid not null references tenements(id),
  kind text not null default 'annual' check (kind in ('annual', 'partial-surrender', 'surrender')),
  period_end date not null,
  lodged_on date not null,
  reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenement_id, kind, period_end)
);

create table if not exists holes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id),
  tenement_id uuid references tenements(id),
  name text not null unique,
  hole_type text not null check (hole_type in ('RC', 'DD', 'RCDD', 'AC', 'RAB')),
  status text not null default 'planned' check (status in ('planned', 'drilling', 'complete', 'abandoned')),
  planned_depth numeric,
  max_depth numeric,
  easting numeric,
  northing numeric,
  rl numeric,
  datum text,
  zone text,
  collar_method text not null default 'planned' check (collar_method in ('planned', 'GPS', 'DGPS', 'RTK', 'total station')),
  azimuth numeric check (azimuth >= 0 and azimuth < 360),
  dip numeric check (dip >= -90 and dip <= 90),
  contractor text,
  rig text,
  started_on date,
  completed_on date,
  capped_on date,
  rehabilitated_on date,
  note text,
  source_ref text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (completed_on is null or started_on is null or completed_on >= started_on)
);

create table if not exists surveys (
  id uuid primary key default gen_random_uuid(),
  hole_id uuid not null references holes(id),
  depth numeric not null check (depth >= 0),
  azimuth numeric not null check (azimuth >= 0 and azimuth < 360),
  dip numeric not null check (dip >= -90 and dip <= 90),
  method text not null default 'gyro',
  azimuth_ref text check (azimuth_ref in ('true', 'magnetic', 'grid')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (hole_id, depth)
);

create table if not exists logs (
  id uuid primary key default gen_random_uuid(),
  hole_id uuid not null references holes(id),
  from_m numeric not null check (from_m >= 0),
  to_m numeric not null,
  lith_code text not null,
  weathering text,
  alteration text,
  description text not null default '',
  logged_by text,
  logged_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (to_m > from_m)
);

create table if not exists labs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text not null unique,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Certified reference materials (standards) and blanks, with the certified value for each element.
create table if not exists standards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'standard' check (kind in ('standard', 'blank')),
  element text not null,
  certified_value numeric not null,
  sd numeric,
  units text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, element),
  check (kind = 'blank' or sd > 0)
);

create table if not exists dispatches (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  lab_id uuid not null references labs(id),
  sent_on date not null,
  consignment text,
  received_on date,
  results_on date,
  lab_job text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (received_on is null or received_on >= sent_on),
  check (results_on is null or (received_on is not null and results_on >= received_on))
);

create table if not exists samples (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  hole_id uuid references holes(id),
  from_m numeric,
  to_m numeric,
  sample_type text not null default 'primary' check (sample_type in ('primary', 'duplicate', 'standard', 'blank')),
  parent_id uuid references samples(id),
  standard_name text,
  recovery_pct numeric check (recovery_pct >= 0 and recovery_pct <= 100),
  weight_kg numeric,
  dispatch_id uuid references dispatches(id),
  source_ref text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (to_m is null or to_m > from_m),
  check (sample_type <> 'duplicate' or parent_id is not null),
  check (sample_type not in ('standard', 'blank') or standard_name is not null),
  check (sample_type not in ('primary', 'duplicate') or (hole_id is not null and from_m is not null and to_m is not null))
);

create table if not exists assays (
  id uuid primary key default gen_random_uuid(),
  sample_id uuid not null references samples(id),
  element text not null,
  value numeric,
  below_detection boolean not null default false,
  detection_limit numeric,
  units text not null,
  method text,
  lab_job text,
  reported_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sample_id, element),
  check (value is not null or below_detection)
);

-- The audit trail. Append only.
create table if not exists events (
  id bigserial primary key,
  actor text not null,
  action text not null,
  record_id uuid,
  before_record jsonb,
  after_record jsonb,
  created_at timestamptz not null default now()
);

create or replace function events_append_only() returns trigger language plpgsql as
$$ begin raise exception 'The audit trail cannot be changed'; end $$;

do $$
declare t text;
begin
  foreach t in array array['projects', 'tenements', 'reports', 'holes', 'surveys', 'logs', 'labs', 'standards', 'dispatches', 'samples', 'assays'] loop
    if not exists (select 1 from pg_trigger where tgname = t || '_touch') then
      execute format('create trigger %I before update on %I for each row execute function touch_updated_at()', t || '_touch', t);
    end if;
  end loop;
  if not exists (select 1 from pg_trigger where tgname = 'events_no_update') then
    create trigger events_no_update before update or delete on events for each row execute function events_append_only();
  end if;
end $$;

create index if not exists samples_hole on samples (hole_id, from_m);
create index if not exists samples_dispatch on samples (dispatch_id);
create index if not exists logs_hole on logs (hole_id, from_m);

-- ---------------------------------------------------------------- views

-- Every hole with metres drilled, logged and sampled, surveys and results.
create or replace view hole_status as
select h.id as hole_id, h.name as hole, p.code as project, coalesce(t.name, '') as tenement, h.hole_type, h.status,
       h.planned_depth, h.max_depth, h.collar_method, h.datum, h.started_on, h.completed_on, h.capped_on, h.rehabilitated_on,
       h.contractor, h.rig,
       coalesce((select sum(l.to_m - l.from_m) from logs l where l.hole_id = h.id), 0) as metres_logged,
       coalesce((select sum(s.to_m - s.from_m) from samples s where s.hole_id = h.id and s.sample_type = 'primary'), 0) as metres_sampled,
       (select count(*) from samples s where s.hole_id = h.id and s.sample_type = 'primary')::int as samples,
       (select count(*) from samples s where s.hole_id = h.id and s.sample_type = 'primary' and s.dispatch_id is null)::int as not_dispatched,
       (select count(*) from samples s where s.hole_id = h.id and s.sample_type = 'primary' and s.dispatch_id is not null
          and not exists (select 1 from assays a where a.sample_id = s.id))::int as awaiting_results,
       (select count(*) from surveys v where v.hole_id = h.id)::int as surveys
from holes h join projects p on p.id = h.project_id left join tenements t on t.id = h.tenement_id;

-- Each lab batch: how many samples of each kind, and where it is in the chain of custody.
create or replace view dispatch_status as
select d.id as dispatch_id, d.name as dispatch, l.name as lab, d.sent_on, d.received_on, d.results_on, d.lab_job,
       (select count(*) from samples s where s.dispatch_id = d.id)::int as samples,
       (select count(*) from samples s where s.dispatch_id = d.id and s.sample_type = 'primary')::int as primaries,
       (select count(*) from samples s where s.dispatch_id = d.id and s.sample_type = 'standard')::int as standards,
       (select count(*) from samples s where s.dispatch_id = d.id and s.sample_type = 'blank')::int as blanks,
       (select count(*) from samples s where s.dispatch_id = d.id and s.sample_type = 'duplicate')::int as duplicates,
       (select count(*) from samples s where s.dispatch_id = d.id and exists (select 1 from assays a where a.sample_id = s.id))::int as with_results,
       case when d.results_on is not null then 'results in'
            when d.received_on is not null then 'at the lab'
            else 'in transit' end as stage,
       case when d.results_on is not null then null
            when d.received_on is not null then (current_date - d.received_on)::int
            else (current_date - d.sent_on)::int end as days_in_stage
from dispatches d join labs l on l.id = d.lab_id;

-- Every standard's result against its certified value, in standard deviations.
create or replace view qc_standards as
select s.id as sample_id, s.name as sample, s.standard_name, d.name as dispatch, a.element, a.value, st.certified_value, st.sd, a.units,
       round((a.value - st.certified_value) / st.sd, 2) as z,
       case when abs(a.value - st.certified_value) / st.sd > setting_num('standard_fail_sd') then 'fail'
            when abs(a.value - st.certified_value) / st.sd > setting_num('standard_warn_sd') then 'warn'
            else 'pass' end as result
from samples s
join assays a on a.sample_id = s.id
join standards st on st.name = s.standard_name and st.element = a.element and st.kind = 'standard'
left join dispatches d on d.id = s.dispatch_id
where s.sample_type = 'standard' and a.value is not null;

-- Every blank against the detection limit.
create or replace view qc_blanks as
select s.id as sample_id, s.name as sample, s.standard_name, d.name as dispatch, a.element,
       coalesce(a.value, 0) as value, a.detection_limit, a.units,
       case when not a.below_detection and a.detection_limit is not null and a.value > a.detection_limit * setting_num('blank_fail_multiple') then 'fail' else 'pass' end as result
from samples s
join assays a on a.sample_id = s.id
left join dispatches d on d.id = s.dispatch_id
where s.sample_type = 'blank';

-- Field duplicates against their original sample: relative difference, mean of the pair as the base.
create or replace view qc_duplicates as
select dup.id as sample_id, dup.name as sample, orig.name as original, d.name as dispatch, a1.element,
       coalesce(a1.value, a1.detection_limit / 2) as original_value, coalesce(a2.value, a2.detection_limit / 2) as duplicate_value, a1.units,
       case when coalesce(a1.value, 0) + coalesce(a2.value, 0) = 0 then 0
            else round(100 * abs(coalesce(a1.value, a1.detection_limit / 2) - coalesce(a2.value, a2.detection_limit / 2))
                       / ((coalesce(a1.value, a1.detection_limit / 2) + coalesce(a2.value, a2.detection_limit / 2)) / 2), 1) end as diff_pct,
       case when a1.below_detection and a2.below_detection then 'pass'
            when 100 * abs(coalesce(a1.value, a1.detection_limit / 2) - coalesce(a2.value, a2.detection_limit / 2))
                 / nullif((coalesce(a1.value, a1.detection_limit / 2) + coalesce(a2.value, a2.detection_limit / 2)) / 2, 0) > setting_num('duplicate_fail_pct') then 'fail'
            else 'pass' end as result
from samples dup
join samples orig on orig.id = dup.parent_id
join assays a1 on a1.sample_id = orig.id
join assays a2 on a2.sample_id = dup.id and a2.element = a1.element
left join dispatches d on d.id = dup.dispatch_id
where dup.sample_type = 'duplicate';

-- How many standards, blanks and duplicates went in each batch against the house insertion rates.
create or replace view qc_rates as
select dispatch_id, dispatch, primaries, standards, blanks, duplicates,
       floor(primaries / setting_num('qc_standard_every'))::int as standards_needed,
       floor(primaries / setting_num('qc_blank_every'))::int as blanks_needed,
       floor(primaries / setting_num('qc_duplicate_every'))::int as duplicates_needed
from dispatch_status;

-- Logging and sampling intervals that overlap the one before, leave a gap, or run past the end of the hole.
create or replace view interval_issues as
with l as (
  select 'logging' as kind, h.name as hole, h.max_depth, x.from_m, x.to_m,
         coalesce(lag(x.to_m) over (partition by x.hole_id order by x.from_m, x.to_m), 0) as prev_to
  from logs x join holes h on h.id = x.hole_id
), s as (
  select 'sampling' as kind, h.name as hole, h.max_depth, x.from_m, x.to_m,
         lag(x.to_m) over (partition by x.hole_id order by x.from_m, x.to_m) as prev_to
  from samples x join holes h on h.id = x.hole_id where x.sample_type = 'primary'
)
select kind, hole, from_m, to_m,
       case when prev_to > from_m then 'overlaps the interval before (' || prev_to || ' m)'
            when prev_to < from_m then 'gap from ' || prev_to || ' m'
            else 'runs past the end of the hole (' || max_depth || ' m)' end as issue
from (select * from l union all select * from s) z
where prev_to > from_m or prev_to < from_m or (max_depth is not null and to_m > max_depth);

-- Each live tenement's last anniversary, the report due date for it, and whether it is lodged.
create or replace view tenement_reports as
with a as (
  select t.*, p.code as project,
         (t.granted_on + (date_part('year', age(current_date, t.granted_on))::int * interval '1 year'))::date as last_anniversary
  from tenements t join projects p on p.id = t.project_id
)
select a.id as tenement_id, a.name as tenement, a.project, a.jurisdiction, a.holder, a.granted_on, a.last_anniversary,
       (a.last_anniversary + interval '1 year')::date as next_anniversary,
       (a.last_anniversary + setting_num('report_due_days')::int) as due_on,
       r.lodged_on, coalesce(r.reference, '') as reference,
       case when r.id is not null then 'lodged'
            when a.last_anniversary = a.granted_on then 'first year'
            when current_date > a.last_anniversary + setting_num('report_due_days')::int then 'overdue'
            else 'due' end as state,
       (select count(*) from holes h where h.tenement_id = a.id and h.completed_on > (a.last_anniversary - interval '1 year')::date and h.completed_on <= a.last_anniversary)::int as holes_in_period,
       (select coalesce(sum(h.max_depth), 0) from holes h where h.tenement_id = a.id and h.completed_on > (a.last_anniversary - interval '1 year')::date and h.completed_on <= a.last_anniversary) as metres_in_period
from a left join reports r on r.tenement_id = a.id and r.kind = 'annual' and r.period_end = a.last_anniversary
where a.status = 'live';

-- Every rule check in docs/compliance.md, one row per breach.
create or replace view compliance_issues as
select 'COLLAR_SURVEY' as rule, h.name as subject, 'Completed hole still at its planned collar position: survey the collar' as issue
  from holes h where h.status = 'complete' and h.collar_method = 'planned'
union all
select 'DATUM', h.name, 'Collar datum is ' || coalesce(h.datum, 'missing') || '; WA reports need GDA2020'
  from holes h left join tenements t on t.id = h.tenement_id
  where h.status = 'complete' and coalesce(t.jurisdiction, 'WA') = 'WA' and coalesce(h.datum, '') <> 'GDA2020'
union all
select 'DOWNHOLE_SURVEY', h.name, 'Completed to ' || h.max_depth || ' m with no downhole survey'
  from holes h where h.status = 'complete' and h.max_depth > setting_num('downhole_survey_min_depth')
  and not exists (select 1 from surveys v where v.hole_id = h.id)
union all
select 'AZIMUTH_REFERENCE', h.name, 'Survey at ' || v.depth || ' m does not say whether the azimuth is true, magnetic or grid'
  from surveys v join holes h on h.id = v.hole_id where v.azimuth_ref is null
union all
select 'LOGGING', hs.hole, 'Logged ' || hs.metres_logged || ' of ' || hs.max_depth || ' m'
  from hole_status hs where hs.status = 'complete' and hs.metres_logged < hs.max_depth
union all
select 'INTERVALS', hole, kind || ' ' || from_m || '-' || to_m || ' m: ' || issue from interval_issues
union all
select 'RECOVERY', h.name, count(*) || ' sample(s) with no recovery recorded'
  from samples s join holes h on h.id = s.hole_id
  where s.sample_type = 'primary' and s.recovery_pct is null and h.hole_type in ('RC', 'DD', 'RCDD')
  group by h.name
union all
select 'CHAIN_OF_CUSTODY', dispatch, 'Sent to ' || lab || ' ' || days_in_stage || ' days ago with no receipt from the lab'
  from dispatch_status where stage = 'in transit' and days_in_stage > setting_num('dispatch_receipt_days')
union all
select 'RESULTS_LATE', dispatch, 'At ' || lab || ' for ' || days_in_stage || ' days with no results'
  from dispatch_status where stage = 'at the lab' and days_in_stage > setting_num('results_due_days')
union all
select 'QC_STANDARD', sample, standard_name || ' ' || element || ' ' || value || ' ' || units || ' against ' || certified_value || ' (' || z || ' SD) in ' || coalesce(dispatch, 'no batch')
  from qc_standards where result = 'fail'
union all
select 'QC_BLANK', sample, standard_name || ' ' || element || ' ' || value || ' ' || units || ', above ' || setting_num('blank_fail_multiple') || ' times the detection limit, in ' || coalesce(dispatch, 'no batch')
  from qc_blanks where result = 'fail'
union all
select 'QC_DUPLICATE', sample, element || ' differs ' || diff_pct || '% from ' || original || ' in ' || coalesce(dispatch, 'no batch')
  from qc_duplicates where result = 'fail'
union all
select 'QC_RATE', dispatch, primaries || ' samples with standards ' || standards || ' of ' || standards_needed || ', blanks ' || blanks || ' of ' || blanks_needed
       || ', duplicates ' || duplicates || ' of ' || duplicates_needed || ' at the house rate'
  from qc_rates where standards < standards_needed or blanks < blanks_needed or duplicates < duplicates_needed
union all
select 'HOLE_NOT_CAPPED', h.name, 'Completed ' || h.completed_on || ' and not capped'
  from holes h where h.status in ('complete', 'abandoned') and h.capped_on is null
union all
select 'REHABILITATION', h.name, 'Completed ' || h.completed_on || ', rehabilitation due ' || (h.completed_on + setting_num('rehab_days')::int)
  from holes h where h.status in ('complete', 'abandoned') and h.rehabilitated_on is null
  and h.completed_on + setting_num('rehab_days')::int <= current_date + 30
union all
select 'REPORT_DUE', tenement, 'Annual report for the year to ' || last_anniversary || ' due ' || due_on || case when state = 'overdue' then ' (overdue)' else '' end
  from tenement_reports where state in ('due', 'overdue') and due_on <= current_date + setting_num('report_notice_days')::int;
