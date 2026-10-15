<h1 align="center">Drillhole Data for Claude Code</h1>

<p align="center">
  <strong>The open-source drillhole database that is just a database and Claude Code.</strong>
</p>

<p align="center">
  Created by <a href="https://www.enterprisedna.co"><strong>Enterprise DNA</strong></a>. Free and open source. Works with Claude Code, Codex, OpenCode or Cursor.
</p>

<!-- three-doors -->
<table align="center">
  <tr>
    <td align="center"><strong>Do it yourself</strong><br/>Clone it, run it, own it. Free, MIT.<br/><a href="#quick-start">Quick start</a></td>
    <td align="center"><strong>We customise it</strong><br/>Your fields, your rules, your MX Deposit data brought across.<br/><a href="https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=mx-deposit">Book a call</a></td>
    <td align="center"><strong>We run it for you</strong><br/>Installed, connected and operated inside Omni. Setup fee, then a retainer.<br/><a href="https://enterprisedna.co/omni/instead-of/mx-deposit?utm_source=github&utm_medium=readme&utm_campaign=mx-deposit">How it works</a></td>
  </tr>
</table>

<p align="center">
  <a href="#what-is-this">What is this</a> &bull;
  <a href="#why-no-front-end">Why no front end</a> &bull;
  <a href="#quick-start">Quick start</a> &bull;
  <a href="#the-commands">Commands</a> &bull;
  <a href="#instead-of-mx-deposit">Instead of MX Deposit</a> &bull;
  <a href="#want-it-installed-and-run-for-you">Installed for you</a> &bull;
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node-20+-339933?style=flat-square" alt="Node 20+" />
  <img src="https://img.shields.io/badge/PostgreSQL-any-336791?style=flat-square" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/PGlite-embedded-3ecf8e?style=flat-square" alt="PGlite" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="MIT License" />
</p>

---

## What is this

Drillhole Data for Claude Code does the job you pay MX Deposit for, as a Postgres database and a set of agent commands. There is no web front end. You open the folder in [Claude Code](https://claude.com/claude-code) (or Codex, OpenCode, Cursor: see `AGENTS.md`) and ask for what you want in plain language. It runs the right query, and it can answer questions the MX Deposit dashboard cannot.

Seequent's own price page lists MX Deposit at US$3,705 a year for each Standard named user, US$5,055 for a Shift licence two people share and US$1,265 for each read-only Reviewer, excluding tax ([MX Deposit pricing](https://www.seequent.com/company/partners/mx-deposit/pricing/), checked 15 October 2026). Ten geologists and field technicians on Standard licences is US$37,050 a year, before the database consultant most junior explorers also retain.

Want the same thing with a web front end, or built on a different stack? That is a customisation, and it is exactly what Enterprise DNA does: [book a call](https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=mx-deposit).

It covers what an exploration team does every week: collars and downhole surveys, geology logging, the sample sheet with its standards, blanks and duplicates, lab batches and the chain of custody, results and QAQC, significant intercepts, hole capping and rehabilitation, and each tenement's annual report. It is built for junior explorers in Australia and New Zealand, and `/compliance` checks your records against JORC Code Table 1 Section 1 and the Western Australian reporting guidelines.

## Why no front end

- The front end was only ever there because the database was hard to talk to. That is no longer true.
- Your data sits in plain Postgres tables you own. Any tool can read them. No export, no lock-in.
- No seats, no tiers, no add-ons. Read [docs/why-no-front-end.md](docs/why-no-front-end.md) for the honest trade-offs too.

## Quick start

Sixty seconds, no database install (an embedded Postgres runs inside Node):

```bash
git clone https://github.com/Enterprise-DNA-OS/drillholes-for-claude-code.git
cd drillholes-for-claude-code
npm install
npm run demo
```

Then open the folder in Claude Code and type `/attention`. It answers from the demo gold project: a certified standard 4.4 standard deviations high, a blank carrying gold, a duplicate that does not repeat, a lab batch 30 days without results, a hole still at its planned collar, a hole due for rehabilitation, and a tenement report 15 days overdue.

### Use it with your own Postgres or Supabase

Copy `.env.example` to `.env`, set `DATABASE_URL`, then `npm run migrate`. Same commands, shared data, no per-seat fee.

## The commands

Every command drives one CLI, `npm run dh -- <command>` (`--json` for machines, `help` for every flag). Changes take `--actor` and `--dry-run`, and land in an audit trail nobody can edit.

**Every day**

| Command | What it does |
|---|---|
| `/attention` | What needs attention today: rule checks, holes drilling, lab batches waiting, samples not yet sent and tenement reports due. |
| `/holes` | Every hole with status, depth, collar survey, surveys, metres logged, samples, samples not sent and samples waiting on results. |
| `/hole` | Everything about one hole: collar, downhole surveys, geology log, sampling by batch and open rule checks. |
| `/pending` | Results still to come: batches in transit or at the lab, and samples in the core yard. |
| `/draft-lab-chase` | Draft a follow-up to the lab about a batch with no receipt or results late. |

**At the rig**

| Command | What it does |
|---|---|
| `/plan-hole` | Add a planned hole with type, depth, planned collar, azimuth and dip. |
| `/start-hole` | Mark a planned hole as drilling, with contractor and rig. |
| `/complete-hole` | Mark a hole complete at its final depth. Refused if logging, samples or surveys go deeper. |
| `/abandon-hole` | Mark a hole abandoned at the depth reached, with the reason. |
| `/survey-collar` | Record the surveyed collar: easting, northing, RL, method and datum. |
| `/add-survey` | Add a downhole survey reading, with whether the azimuth is true, magnetic or grid. |
| `/log-interval` | Log a geology interval. Refused if it overlaps one already logged. |
| `/sample-hole` | Make the sample sheet: one ticket per interval, with a standard, blank and duplicate every Nth ticket at the house rates. |
| `/add-qc` | Add one standard, blank or duplicate ticket by hand. |
| `/set-recovery` | Record sample recovery for a depth range. |
| `/cap-hole` | Record a hole capped. |
| `/rehab-hole` | Record a hole site rehabilitated. |

**Samples and the lab**

| Command | What it does |
|---|---|
| `/dispatch` | Send samples to a lab as a batch, by hole or ticket range. Warns when the batch is short of QC. |
| `/receive` | Record the lab's receipt of a batch, with their job number. |
| `/load-results` | Load a lab results CSV. Below detection stays below detection. QC failures are reported straight after. |
| `/dispatches` | Every batch with sent, received and reported dates, the QC in it, and days at each stage. |
| `/samples` | Samples for one hole or batch: interval, type, recovery, batch, results in. |
| `/labs` | Laboratories and their batches. |

**Results and QAQC**

| Command | What it does |
|---|---|
| `/qaqc` | Standards in standard deviations from their certified values, blanks against detection limits, duplicates against originals, and insertion rates by batch. |
| `/standards` | Certified reference materials and blanks on file. |
| `/add-standard` | Add a standard or blank with its certified value and standard deviation. |
| `/assays` | Results down one hole for one element, with below detection and pending shown. |
| `/intercepts` | Significant intercepts at a cut-off, with internal dilution and a minimum length: "5 m @ 3.22 g/t Au from 31 m". |
| `/draft-announcement` | Draft the intercepts table and collar table for a market release, with open QC listed, for the competent person. |

**Monday and the regulator**

| Command | What it does |
|---|---|
| `/weekly-review` | The Monday review: metres drilled, results in, batches waiting, QC failures, reports due, holes to rehabilitate, rule checks by rule. |
| `/compliance` | Check the records against JORC Table 1 Section 1, the WA reporting guidelines and your QC limits, with the source for each rule. |
| `/reports` | Each tenement's annual report: the year it covers, the due date, whether it is lodged, holes and metres in the year. |
| `/report-files` | Lay out the collar, survey, geology, assay and QAQC tables for a tenement's annual report, with datum and zone stated. |
| `/lodge-report` | Record a report lodged with the department's reference. |
| `/drilling` | Metres drilled by contractor, rig and month, for the driller's invoice. |

**Setup and data**

| Command | What it does |
|---|---|
| `/projects`, `/add-project` | Projects with commodity, datum, projection and zone. |
| `/tenements`, `/add-tenement` | Tenements with holder and grant date (which sets the report anniversary). |
| `/add-lab` | Add a laboratory. |
| `/settings`, `/set` | House settings: report days, rehabilitation days, lab turnaround, QC limits and insertion rates. |
| `/activity` | The audit trail: who changed what, when. |
| `/import` | Bring holes, surveys, logging, samples and results across from an MX Deposit export. |
| `/export` | Write every record to one JSON archive. |
| `/customise` | Make this system yours in plain language. Add a field, change a QC limit, add a table for structure or geotech. Writes the migration, applies it, updates the commands that touch it. |
| `/new-view` | Add a read-only HTML view (a dashboard page) from a plain-language description, rendered in your brand by `npm run view`. |

Documents, in your brand from `brand.json`: `npm run docs` renders a drill hole summary log for each hole, a sample submission sheet for each lab batch (with a receipt block for the lab to sign), and a drilling summary for each tenement's reporting year. `npm run view` renders three read-only pages: this week, QAQC, and holes.

## Ten questions MX Deposit does not answer

1. Which certified standards in last month's batches fell outside three standard deviations, and which samples sit either side of them? (`/qaqc`)
2. Which batches went to the lab short of the house rate of standards, blanks or duplicates? (`/compliance`)
3. Which batches has the lab had for more than 21 days with no results? (`/pending`)
4. What are the significant intercepts at a 0.5 g/t cut-off with 2 m of internal dilution, as a table for the release? (`/intercepts`, `/draft-announcement`)
5. Which completed holes are still at their planned collar or have no downhole survey? (`/compliance`)
6. Which tenement reports fall due in the next 45 days, and which holes go in each? (`/reports`, `/report-files`)
7. Which holes are not capped, and which are due for rehabilitation within a month? (`/compliance`)
8. Do the driller's metres for September match the holes we completed? (`/drilling`)
9. Which RC samples have no recovery recorded? (`/compliance`)
10. Which holes have gaps or overlaps in their geology log? (`/hole`, `/compliance`)

## Your first hour: ten things to ask for

1. "Put our company name and logo on everything." (`brand.json`)
2. "Add the Kestrel Ridge project, GDA2020 zone 51, and our three tenements." (`/add-project`, `/add-tenement`)
3. "Add our standards from these certificates." (`/add-standard`)
4. "Bring across this MX Deposit export." (`/import`)
5. "What needs attention today?" (`/attention`)
6. "Make the sample sheet for KRRC006, 0 to 80 m, tickets from KR60001." (`/sample-hole`)
7. "Load this results file from the lab and show me the QAQC." (`/load-results`, `/qaqc`)
8. "What are the intercepts above 0.5 g/t? Draft the table for the release." (`/intercepts`, `/draft-announcement`)
9. "Add a table for structure measurements: depth, alpha, beta, type." (`/customise`)
10. "Write Monday's review for the exploration manager." (`/weekly-review`)

## Instead of MX Deposit

Export the holes from MX Deposit (one CSV per table, in a ZIP), unzip it, preview with `npm run dh -- import mx-deposit --dir=imports/mx --project=KR --actor="Your name" --dry-run`, then load it. Holes, surveys, geology, samples with their QC, and results come across; dispatch dates, certified values, core photos and custom tables need a step each. The full guide, with the header mapping: [docs/replace-mx-deposit.md](docs/replace-mx-deposit.md).

What the checks are based on: [docs/compliance.md](docs/compliance.md).

## Architecture

```
drillholes-for-claude-code/
  CLAUDE.md                 how the operator wants this run (routing table + house rules)
  AGENTS.md                 the same, for Codex / OpenCode / Cursor / Gemini CLI
  .claude/commands/         the slash commands
  scripts/drillholes.mjs    the one CLI the commands drive
  documents.json            hole summary log, sample submission sheet, tenement drilling summary
  views.json                this week, QAQC, holes
  fixtures/                 a lab results file and an MX Deposit export for the demo and tests
  scripts/lib/db.mjs        one adapter: DATABASE_URL (pg) or embedded PGlite
  supabase/migrations/      plain SQL schema
  supabase/seed.sql         demo data
  docs/                     the thesis and the migration guide
```

## Built for coding agents

The database, CLI and command recipes work with Claude Code, Codex, OpenCode or Cursor. Ask your coding agent for a new command and have it implement and test the change against the same records.

## Contributing

Issues and pull requests are welcome. Keep the shape: plain SQL, a small CLI, a slash command per recurring job, no front end.

## Want it installed and run for you?

Enterprise DNA installs Drillhole Data for Claude Code for your business, migrates your MX Deposit data, connects it to the rest of your tools, and runs it for you as part of **Omni**, our managed Command Center. One setup fee, then a monthly retainer.

- Book a call: [enterprisedna.co/omni/book](https://enterprisedna.co/omni/book/?offer=replace-software&utm_source=github&utm_medium=readme&utm_campaign=mx-deposit)
- Read more: [enterprisedna.co/omni/instead-of/mx-deposit](https://enterprisedna.co/omni/instead-of/mx-deposit?utm_source=github&utm_medium=readme&utm_campaign=mx-deposit)

## License

MIT. Copyright (c) 2026 Enterprise DNA.
