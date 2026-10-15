---
description: Record the surveyed collar position: easting, northing, RL, method (GPS, DGPS, RTK, total station) and datum.
---

Run `npm run dh -- survey-collar --hole=<hole> --easting=… --northing=… [--rl=…] --method=GPS|DGPS|RTK|"total station" [--datum=GDA2020] [--zone=51] --actor=<name>`.

This changes records. Get the real person's name for --actor. Run it with --dry-run first, show the operator what will change, and run it for real only after a yes in this session. Never invent a depth, a coordinate, an assay or a date.
