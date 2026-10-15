---
description: Mark a hole complete at its final depth. Refused if logging, samples or surveys go deeper.
---

Run `npm run dh -- complete-hole --hole=<hole> --depth=<m> [--on=YYYY-MM-DD] --actor=<name>`.

This changes records. Get the real person's name for --actor. Run it with --dry-run first, show the operator what will change, and run it for real only after a yes in this session. Never invent a depth, a coordinate, an assay or a date.

Remind the operator to survey the collar, run a downhole survey and cap the hole if those are not on file.
