---
description: Add a project with its commodity, datum, projection and zone.
---

Run `npm run dh -- add-project --name="<name>" --code=<CODE> [--commodity=Au] [--datum=GDA2020] [--projection=MGA] [--zone=51] --actor=<name>`.

This changes records. Get the real person's name for --actor. Run it with --dry-run first, show the operator what will change, and run it for real only after a yes in this session. Never invent a depth, a coordinate, an assay or a date.
