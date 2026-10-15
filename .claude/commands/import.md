---
description: Bring holes, surveys, logging, samples and results across from an MX Deposit export (the unzipped folder of CSV files).
---

Run `npm run dh -- import mx-deposit --dir=<unzipped export> --project=<code> [--map=<mapping.json>] --actor=<name>`.

This changes records. Get the real person's name for --actor. Run it with --dry-run first, show the operator what will change, and run it for real only after a yes in this session. Never invent a depth, a coordinate, an assay or a date.

Read docs/replace-mx-deposit.md first. Always run with --dry-run and show the counts before the real run. Tenements named in the export must exist first (add-tenement). The summary lists any that do not.
