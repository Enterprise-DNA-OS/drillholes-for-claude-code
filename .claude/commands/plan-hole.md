---
description: Add a planned hole with its type, planned depth, planned collar, azimuth and dip.
---

Run `npm run dh -- plan-hole --name=<HOLE> --project=<code> [--tenement=<tenement>] --type=RC|DD|RCDD|AC|RAB [--depth=<m>] [--easting=…] [--northing=…] [--azimuth=…] [--dip=…] --actor=<name>`.

This changes records. Get the real person's name for --actor. Run it with --dry-run first, show the operator what will change, and run it for real only after a yes in this session. Never invent a depth, a coordinate, an assay or a date.
