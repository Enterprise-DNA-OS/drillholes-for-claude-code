---
description: Check the records against JORC Table 1 Section 1, the WA reporting guidelines and the house QC limits in docs/compliance.md, and report what is breached or about to be, with the source cited.
---

Run `npm run dh -- compliance --json`.

Present the result as a short table in plain words. If a name matches more than one record the command lists them: ask which one.

Read `docs/compliance.md` first. Report as a table: rule, count, the worst example, the source. Order: QC and results first (they block a release), then collars and surveys, then logging and sampling, then field and reports. For anything breached, name the command that fixes it. If a rule in the doc is out of date, say so and stop: the operator confirms the rule, then you update the doc and the check together. Nothing here is legal advice or a competent person's sign-off.
