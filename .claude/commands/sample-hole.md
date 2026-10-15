---
description: Make the sample sheet for a hole: one ticket per interval, with a standard, blank and field duplicate every Nth ticket at the house rates.
---

Run `npm run dh -- sample-hole --hole=<hole> --from=<m> --to=<m> [--interval=1] --prefix=<KR> --start=<first ticket number> [--standards=CRM-LOW,CRM-HIGH] [--blank=BLANK-1] [--duplicates=yes|no] --actor=<name>`.

This changes records. Get the real person's name for --actor. Run it with --dry-run first, show the operator what will change, and run it for real only after a yes in this session. Never invent a depth, a coordinate, an assay or a date.

Check the last ticket used with `samples` first so numbers never repeat. The standards rotate in the order given.
