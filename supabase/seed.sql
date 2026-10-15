-- Fictional demo: one gold project in Western Australia, three tenements, seven holes,
-- three lab batches and a QC programme with something wrong in every corner.
-- Dates are relative to today so the attention list always has something to say. Safe to run twice.

insert into projects (id, name, code, commodity, datum, projection, zone) values
  ('a0000000-0000-4000-8000-000000000001', 'Kestrel Ridge Gold Project', 'KR', 'Au', 'GDA2020', 'MGA', '51')
on conflict do nothing;

insert into tenements (id, project_id, name, jurisdiction, holder, granted_on, expires_on) values
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'E 29/1187', 'WA', 'Example Resources Pty Ltd',
     (current_date - interval '4 years' - interval '20 days')::date, (current_date + interval '1 year' - interval '20 days')::date),
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'E 29/1215', 'WA', 'Example Resources Pty Ltd',
     (current_date - interval '3 years' - interval '75 days')::date, (current_date + interval '2 years' - interval '75 days')::date),
  ('b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'E 29/1240', 'WA', 'Example Resources Pty Ltd',
     (current_date - interval '2 years' - interval '150 days')::date, (current_date + interval '3 years' - interval '150 days')::date)
on conflict do nothing;

insert into reports (id, tenement_id, kind, period_end, lodged_on, reference) values
  ('b1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000003', 'annual',
     (current_date - interval '150 days')::date, (current_date - interval '110 days')::date, 'A-150231')
on conflict do nothing;

insert into labs (id, name, code, email) values
  ('c0000000-0000-4000-8000-000000000001', 'Example Assay Laboratories Perth', 'EAL', 'samples@example-assay.test'),
  ('c0000000-0000-4000-8000-000000000002', 'Goldfields Sample Prep Kalgoorlie', 'GSP', 'reception@goldfields-prep.test')
on conflict do nothing;

insert into standards (id, name, kind, element, certified_value, sd, units) values
  ('c1000000-0000-4000-8000-000000000001', 'CRM-LOW', 'standard', 'Au', 0.52, 0.02, 'g/t'),
  ('c1000000-0000-4000-8000-000000000002', 'CRM-HIGH', 'standard', 'Au', 2.10, 0.07, 'g/t'),
  ('c1000000-0000-4000-8000-000000000003', 'BLANK-1', 'blank', 'Au', 0, null, 'g/t')
on conflict do nothing;

-- Holes. KRRC001 is overdue for rehabilitation; KRRC003 is at its planned collar and uncapped;
-- KRRC004 has no downhole survey and an old datum; KRDD001 is drilling now.
insert into holes (id, project_id, tenement_id, name, hole_type, status, planned_depth, max_depth, easting, northing, rl, datum, zone,
                   collar_method, azimuth, dip, contractor, rig, started_on, completed_on, capped_on, rehabilitated_on) values
  ('d0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'KRRC001', 'RC', 'complete',
     60, 60, 352410.2, 6634120.8, 412.6, 'GDA2020', '51', 'RTK', 270, -60, 'Example Drilling', 'RC-07',
     current_date - 203, current_date - 200, current_date - 200, null),
  ('d0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'KRRC002', 'RC', 'complete',
     60, 60, 352450.0, 6634120.5, 412.9, 'GDA2020', '51', 'DGPS', 270, -60, 'Example Drilling', 'RC-07',
     current_date - 42, current_date - 40, current_date - 40, null),
  ('d0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'KRRC003', 'RC', 'complete',
     50, 48, 352490.0, 6634120.0, 413.0, 'GDA2020', '51', 'planned', 270, -60, 'Example Drilling', 'RC-07',
     current_date - 13, current_date - 12, null, null),
  ('d0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'KRRC004', 'RC', 'complete',
     42, 42, 352530.4, 6634119.6, 413.2, 'GDA94', '51', 'DGPS', 270, -60, 'Example Drilling', 'RC-07',
     current_date - 6, current_date - 5, current_date - 5, null),
  ('d0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'KRDD001', 'DD', 'drilling',
     250, 87.4, 352300.0, 6634400.0, 410.1, 'GDA2020', '51', 'DGPS', 90, -55, 'Core Drilling Example', 'DD-02',
     current_date - 3, null, null, null),
  ('d0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'KRRC005', 'RC', 'planned',
     80, null, 352570.0, 6634120.0, null, 'GDA2020', '51', 'planned', 270, -60, null, null,
     null, null, null, null),
  ('d0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000003', 'KRAC010', 'AC', 'abandoned',
     40, 18, 351900.0, 6633800.0, 409.0, 'GDA2020', '51', 'GPS', 0, -90, 'Example Drilling', 'AC-01',
     current_date - 260, current_date - 260, current_date - 260, current_date - 120)
on conflict do nothing;

-- Downhole surveys. KRRC003's survey does not say true or magnetic; KRRC004 has none.
insert into surveys (id, hole_id, depth, azimuth, dip, method, azimuth_ref) values
  ('d1000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 30, 271.5, -59.4, 'gyro', 'true'),
  ('d1000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 60, 272.8, -58.9, 'gyro', 'true'),
  ('d1000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000002', 60, 270.9, -59.6, 'gyro', 'true'),
  ('d1000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000003', 48, 268.2, -60.3, 'camera', null),
  ('d1000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000005', 50, 91.2, -54.6, 'gyro', 'true')
on conflict do nothing;

-- Geology logging. KRRC002 has a gap from 40 to 44 m.
insert into logs (id, hole_id, from_m, to_m, lith_code, weathering, alteration, description, logged_by, logged_on)
select md5('log' || h || f)::uuid, h::uuid, f, t, lith, w, alt, descr, 'J. Example', current_date - d
from (values
  ('d0000000-0000-4000-8000-000000000001', 0, 6, 'CLAY', 'CW', null, 'Transported clay cover', 200),
  ('d0000000-0000-4000-8000-000000000001', 6, 24, 'SAP', 'HW', null, 'Saprolite after basalt', 200),
  ('d0000000-0000-4000-8000-000000000001', 24, 31, 'BSLT', 'MW', 'chlorite', 'Basalt, weak chlorite', 200),
  ('d0000000-0000-4000-8000-000000000001', 31, 37, 'QV', 'FR', 'sericite-pyrite', 'Quartz vein with 2-5% pyrite in sericite selvage', 200),
  ('d0000000-0000-4000-8000-000000000001', 37, 60, 'BSLT', 'FR', 'chlorite', 'Fresh basalt', 200),
  ('d0000000-0000-4000-8000-000000000002', 0, 8, 'CLAY', 'CW', null, 'Transported clay cover', 40),
  ('d0000000-0000-4000-8000-000000000002', 8, 26, 'SAP', 'HW', null, 'Saprolite after basalt', 40),
  ('d0000000-0000-4000-8000-000000000002', 26, 40, 'BSLT', 'MW', 'chlorite', 'Basalt, weak chlorite', 40),
  ('d0000000-0000-4000-8000-000000000002', 44, 60, 'BSLT', 'FR', 'chlorite', 'Fresh basalt', 40),
  ('d0000000-0000-4000-8000-000000000003', 0, 5, 'CLAY', 'CW', null, 'Transported clay cover', 12),
  ('d0000000-0000-4000-8000-000000000003', 5, 22, 'SAP', 'HW', null, 'Saprolite after basalt', 12),
  ('d0000000-0000-4000-8000-000000000003', 22, 48, 'BSLT', 'FR', 'chlorite', 'Fresh basalt', 12),
  ('d0000000-0000-4000-8000-000000000004', 0, 7, 'CLAY', 'CW', null, 'Transported clay cover', 5),
  ('d0000000-0000-4000-8000-000000000004', 7, 42, 'SAP', 'HW', null, 'Saprolite after basalt', 5),
  ('d0000000-0000-4000-8000-000000000005', 0, 12, 'CLAY', 'CW', null, 'Transported clay cover', 1),
  ('d0000000-0000-4000-8000-000000000005', 12, 50, 'SAP', 'HW', null, 'Saprolite after basalt', 1),
  ('d0000000-0000-4000-8000-000000000007', 0, 18, 'CLAY', 'CW', null, 'Clay to blade refusal', 260)
) v(h, f, t, lith, w, alt, descr, d)
on conflict do nothing;

insert into dispatches (id, name, lab_id, sent_on, consignment, received_on, results_on, lab_job) values
  ('e0000000-0000-4000-8000-000000000001', 'KR-D001', 'c0000000-0000-4000-8000-000000000001', current_date - 196, 'CN-44811', current_date - 194, current_date - 175, 'PER26-01142'),
  ('e0000000-0000-4000-8000-000000000002', 'KR-D002', 'c0000000-0000-4000-8000-000000000001', current_date - 33, 'CN-45920', current_date - 30, null, 'PER26-04410'),
  ('e0000000-0000-4000-8000-000000000003', 'KR-D003', 'c0000000-0000-4000-8000-000000000002', current_date - 12, 'CN-46102', null, null, null)
on conflict do nothing;

-- Primary samples at one metre. KR1xxxx = KRRC001, KR2xxxx = KRRC002 and so on.
-- KRRC004 is not dispatched yet and three of its samples have no recovery.
insert into samples (id, name, hole_id, from_m, to_m, sample_type, recovery_pct, weight_kg, dispatch_id)
select md5('s' || h.n || g)::uuid, 'KR' || h.n || lpad(g::text, 4, '0'), h.id::uuid, g - 1, g, 'primary',
       case when h.n = 4 and g in (12, 13, 14) then null else 80 + (g * 7) % 20 end,
       2.5 + ((g * 13) % 10) / 10.0, h.dispatch::uuid
from (values
  (1, 'd0000000-0000-4000-8000-000000000001', 60, 'e0000000-0000-4000-8000-000000000001'),
  (2, 'd0000000-0000-4000-8000-000000000002', 60, 'e0000000-0000-4000-8000-000000000002'),
  (3, 'd0000000-0000-4000-8000-000000000003', 48, 'e0000000-0000-4000-8000-000000000003'),
  (4, 'd0000000-0000-4000-8000-000000000004', 42, null)
) h(n, id, depth, dispatch), generate_series(1, h.depth) g
on conflict do nothing;

-- QC inserts. KR-D002 is one standard short of the house rate.
insert into samples (id, name, sample_type, standard_name, dispatch_id, hole_id, from_m, to_m, parent_id) values
  ('f0000000-0000-4000-8000-000000000001', 'KR90001', 'standard', 'CRM-LOW', 'e0000000-0000-4000-8000-000000000001', null, null, null, null),
  ('f0000000-0000-4000-8000-000000000002', 'KR90002', 'standard', 'CRM-HIGH', 'e0000000-0000-4000-8000-000000000001', null, null, null, null),
  ('f0000000-0000-4000-8000-000000000003', 'KR90003', 'standard', 'CRM-LOW', 'e0000000-0000-4000-8000-000000000001', null, null, null, null),
  ('f0000000-0000-4000-8000-000000000004', 'KR90004', 'blank', 'BLANK-1', 'e0000000-0000-4000-8000-000000000001', null, null, null, null),
  ('f0000000-0000-4000-8000-000000000005', 'KR90005', 'duplicate', null, 'e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 9, 10, md5('s110')::uuid),
  ('f0000000-0000-4000-8000-000000000006', 'KR90006', 'duplicate', null, 'e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 34, 35, md5('s135')::uuid),
  ('f0000000-0000-4000-8000-000000000007', 'KR90007', 'duplicate', null, 'e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 49, 50, md5('s150')::uuid),
  ('f0000000-0000-4000-8000-000000000008', 'KR90008', 'standard', 'CRM-LOW', 'e0000000-0000-4000-8000-000000000002', null, null, null, null),
  ('f0000000-0000-4000-8000-000000000009', 'KR90009', 'standard', 'CRM-HIGH', 'e0000000-0000-4000-8000-000000000002', null, null, null, null),
  ('f0000000-0000-4000-8000-000000000010', 'KR90010', 'blank', 'BLANK-1', 'e0000000-0000-4000-8000-000000000002', null, null, null, null),
  ('f0000000-0000-4000-8000-000000000011', 'KR90011', 'duplicate', null, 'e0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000002', 19, 20, md5('s220')::uuid),
  ('f0000000-0000-4000-8000-000000000012', 'KR90012', 'duplicate', null, 'e0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000002', 39, 40, md5('s240')::uuid),
  ('f0000000-0000-4000-8000-000000000013', 'KR90013', 'duplicate', null, 'e0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000002', 59, 60, md5('s260')::uuid),
  ('f0000000-0000-4000-8000-000000000014', 'KR90014', 'standard', 'CRM-LOW', 'e0000000-0000-4000-8000-000000000003', null, null, null, null),
  ('f0000000-0000-4000-8000-000000000015', 'KR90015', 'standard', 'CRM-HIGH', 'e0000000-0000-4000-8000-000000000003', null, null, null, null),
  ('f0000000-0000-4000-8000-000000000016', 'KR90016', 'blank', 'BLANK-1', 'e0000000-0000-4000-8000-000000000003', null, null, null, null),
  ('f0000000-0000-4000-8000-000000000017', 'KR90017', 'duplicate', null, 'e0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000003', 19, 20, md5('s320')::uuid),
  ('f0000000-0000-4000-8000-000000000018', 'KR90018', 'duplicate', null, 'e0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000003', 39, 40, md5('s340')::uuid)
on conflict do nothing;

-- Results for KR-D001: background gold, an intercept from 31 to 36 m and a weaker one at 48 to 50 m.
-- One CRM-HIGH fails, the blank carries gold and the 34 to 35 m duplicate does not repeat.
insert into assays (id, sample_id, element, value, below_detection, detection_limit, units, method, lab_job, reported_on)
select md5('a' || s.id::text)::uuid, s.id, 'Au',
       case when g.n in (32, 33, 34, 35, 36) then (array[0.82, 2.41, 6.12, 4.80, 1.93])[g.n - 31]
            when g.n in (49, 50) then (array[0.61, 0.74])[g.n - 48]
            when g.n % 7 = 0 then null
            else round(0.01 + ((g.n * 37) % 40) / 1000.0, 3) end,
       g.n % 7 = 0 and g.n not in (35, 49), 0.01, 'g/t', 'FA50', 'PER26-01142', current_date - 175
from samples s cross join lateral (select substr(s.name, 4)::int as n) g
where s.hole_id = 'd0000000-0000-4000-8000-000000000001' and s.sample_type = 'primary'
on conflict do nothing;

insert into assays (id, sample_id, element, value, below_detection, detection_limit, units, method, lab_job, reported_on) values
  (md5('aqc1')::uuid, 'f0000000-0000-4000-8000-000000000001', 'Au', 0.53, false, 0.01, 'g/t', 'FA50', 'PER26-01142', current_date - 175),
  (md5('aqc2')::uuid, 'f0000000-0000-4000-8000-000000000002', 'Au', 2.41, false, 0.01, 'g/t', 'FA50', 'PER26-01142', current_date - 175),
  (md5('aqc3')::uuid, 'f0000000-0000-4000-8000-000000000003', 'Au', 0.50, false, 0.01, 'g/t', 'FA50', 'PER26-01142', current_date - 175),
  (md5('aqc4')::uuid, 'f0000000-0000-4000-8000-000000000004', 'Au', 0.09, false, 0.01, 'g/t', 'FA50', 'PER26-01142', current_date - 175),
  (md5('aqc5')::uuid, 'f0000000-0000-4000-8000-000000000005', 'Au', 0.02, false, 0.01, 'g/t', 'FA50', 'PER26-01142', current_date - 175),
  (md5('aqc6')::uuid, 'f0000000-0000-4000-8000-000000000006', 'Au', 2.90, false, 0.01, 'g/t', 'FA50', 'PER26-01142', current_date - 175),
  (md5('aqc7')::uuid, 'f0000000-0000-4000-8000-000000000007', 'Au', 0.69, false, 0.01, 'g/t', 'FA50', 'PER26-01142', current_date - 175)
on conflict do nothing;
