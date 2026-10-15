---
description: Mark a hole abandoned at the depth it reached, with the reason.
---

Run `npm run dh -- abandon-hole --hole=<hole> --depth=<m> [--on=YYYY-MM-DD] [--note="<reason>"] --actor=<name>`.

This changes records. Get the real person's name for --actor. Run it with --dry-run first, show the operator what will change, and run it for real only after a yes in this session. Never invent a depth, a coordinate, an assay or a date.
