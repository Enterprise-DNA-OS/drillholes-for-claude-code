---
description: Log a geology interval: from, to, lithology code, weathering, alteration and description. Refused if it overlaps an interval already logged.
---

Run `npm run dh -- log-interval --hole=<hole> --from=<m> --to=<m> --lith=<code> [--weathering=…] [--alteration=…] [--description="…"] [--by=<geologist>] [--on=YYYY-MM-DD] --actor=<name>`.

This changes records. Get the real person's name for --actor. Run it with --dry-run first, show the operator what will change, and run it for real only after a yes in this session. Never invent a depth, a coordinate, an assay or a date.

For a whole log sheet, run one per row, or ask to bring the sheet across with /import.
