---
description: Send samples to a lab as a batch: every sample not yet sent from a hole, or ticket ranges. Warns when the batch is below the house QC rate.
---

Run `npm run dh -- dispatch --name=<batch> --lab=<lab> [--hole=<hole>] [--samples=KR40001-KR40042,KR90019] [--on=YYYY-MM-DD] [--consignment=<ref>] --actor=<name>`.

This changes records. Get the real person's name for --actor. Run it with --dry-run first, show the operator what will change, and run it for real only after a yes in this session. Never invent a depth, a coordinate, an assay or a date.

Then run `npm run docs -- sample-submission` for the submission sheet that travels with the samples.
