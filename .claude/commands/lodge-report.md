---
description: Record a tenement report as lodged, with the department's reference. Defaults to the annual report for the last anniversary.
---

Run `npm run dh -- lodge-report --tenement=<tenement> [--kind=annual|partial-surrender|surrender] [--period-end=YYYY-MM-DD] [--on=YYYY-MM-DD] [--reference=<ref>] --actor=<name>`.

This changes records. Get the real person's name for --actor. Run it with --dry-run first, show the operator what will change, and run it for real only after a yes in this session. Never invent a depth, a coordinate, an assay or a date.
