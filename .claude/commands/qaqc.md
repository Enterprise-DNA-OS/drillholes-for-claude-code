---
description: QAQC for one batch or all: each standard against its certified value in standard deviations, blanks against the detection limit, field duplicates against their originals, and insertion rates.
---

Run `npm run dh -- qaqc [--dispatch=<batch>] --json`.

Present the result as a short table in plain words. If a name matches more than one record the command lists them: ask which one.

Lead with failures. For a failed standard, suggest asking the lab to re-assay the samples either side of it. For a failed blank, check the samples after a high-grade sample for carry-over.
