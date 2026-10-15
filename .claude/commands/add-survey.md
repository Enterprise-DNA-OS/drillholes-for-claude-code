---
description: Add a downhole survey reading: depth, azimuth, dip, tool and whether the azimuth is true, magnetic or grid.
---

Run `npm run dh -- add-survey --hole=<hole> --depth=<m> --azimuth=… --dip=… [--method=gyro] --ref=true|magnetic|grid --actor=<name>`.

This changes records. Get the real person's name for --actor. Run it with --dry-run first, show the operator what will change, and run it for real only after a yes in this session. Never invent a depth, a coordinate, an assay or a date.
