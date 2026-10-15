---
description: Add a tenement to a project with its jurisdiction, holder and grant date. The grant date sets the anniversary the annual report runs from.
---

Run `npm run dh -- add-tenement --name="E 29/1300" --project=<code> --granted=YYYY-MM-DD [--expires=YYYY-MM-DD] [--jurisdiction=WA] [--holder="<company>"] --actor=<name>`.

This changes records. Get the real person's name for --actor. Run it with --dry-run first, show the operator what will change, and run it for real only after a yes in this session. Never invent a depth, a coordinate, an assay or a date.
