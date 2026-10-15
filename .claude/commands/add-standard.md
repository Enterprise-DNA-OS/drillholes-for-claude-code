---
description: Add a certified reference material or blank with its certified value and standard deviation for one element.
---

Run `npm run dh -- add-standard --name=<CRM> [--kind=standard|blank] --element=<Au> --value=<certified> [--sd=<sd>] --units=g/t|ppm|% --actor=<name>`.

This changes records. Get the real person's name for --actor. Run it with --dry-run first, show the operator what will change, and run it for real only after a yes in this session. Never invent a depth, a coordinate, an assay or a date.

Take the certified value and standard deviation from the certificate. Never estimate them.
