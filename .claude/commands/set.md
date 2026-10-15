---
description: Change a house setting, such as a QC limit or the report due days.
---

Run `npm run dh -- set --key=<key> --value=<number> --actor=<name>`.

This changes records. Get the real person's name for --actor. Run it with --dry-run first, show the operator what will change, and run it for real only after a yes in this session. Never invent a depth, a coordinate, an assay or a date.

Show `settings` first. For report_due_days and rehab_days, ask which rule the new value comes from and update docs/compliance.md in the same change.
