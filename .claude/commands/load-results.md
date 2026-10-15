---
description: Load a lab results file (CSV, one row per sample, one column per element) into a batch. Below detection is kept as below detection. Reports QC failures straight after.
---

Run `npm run dh -- load-results --file=<results.csv> [--dispatch=<batch>] [--method=<code>] [--on=YYYY-MM-DD] --actor=<name>`.

This changes records. Get the real person's name for --actor. Run it with --dry-run first, show the operator what will change, and run it for real only after a yes in this session. Never invent a depth, a coordinate, an assay or a date.

Element columns are headed like `Au_gpt`, `Au (g/t)`, `Cu_ppm` or `Cu (%)`. After loading, show `qaqc` for the batch before anyone looks at the grades.
