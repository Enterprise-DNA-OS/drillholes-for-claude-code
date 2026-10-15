# Moving off MX Deposit

MX Deposit's export writes every table as a CSV file, with headers exactly as they appear in your MX Deposit setup, in one ZIP ([Seequent Community](https://community.seequent.com/discussion/2103/exporting-data-from-mx-deposit)). Export templates let you choose the tables and columns. That is the whole way out, and it is enough.

## 1. Export

In MX Deposit, select the holes (or the whole activity), click Export, and download the ZIP. Unzip it into a folder such as `imports/mx/`. The `imports/` folder is ignored by git, so your data never lands in the repo.

Rename the files to the names below, or keep MX Deposit's names and list them in a mapping file (step 3):

| File | Holds |
|---|---|
| `collar.csv` | One row per hole (required) |
| `survey.csv` | Downhole surveys |
| `lithology.csv` | Geology intervals |
| `samples.csv` | Primary samples, standards, blanks and duplicates, with the dispatch |
| `assays.csv` | One row per sample and element |

## 2. Set up the project first

```bash
npm run dh -- add-project --name="Kestrel Ridge Gold Project" --code=KR --commodity=Au --datum=GDA2020 --zone=51 --actor="Your name"
npm run dh -- add-tenement --name="E 29/1187" --project=KR --granted=2022-09-25 --actor="Your name"
npm run dh -- add-standard --name=CRM-LOW --element=Au --value=0.52 --sd=0.02 --units=g/t --actor="Your name"
```

Add every tenement named in the collar file and every standard named in the samples file. Take certified values from the certificates.

## 3. Map your headers (only if they differ)

The importer expects MX Deposit's common headings: `Hole ID`, `Hole Type`, `Hole Status`, `Easting`, `Northing`, `Elevation`, `Datum`, `Survey Method`, `Azimuth`, `Dip`, `Planned Depth`, `Final Depth`, `Start Date`, `End Date`, `Tenement`, `Drilling Company`, `Rig`; surveys `Depth`, `Azimuth`, `Dip`, `Survey Type`, `Azimuth Reference`; intervals `From`, `To`, `Lithology`, `Weathering`, `Alteration`, `Comments`, `Logged By`; samples `Sample ID`, `Sample Type`, `Parent Sample`, `Standard ID`, `Recovery %`, `Weight (kg)`, `Dispatch ID`, `Lab`; assays `Sample ID`, `Element`, `Value`, `Units`, `Method`.

If yours differ, write a JSON file of only the ones that change, for example:

```json
{ "hole": "HoleID", "depth": "EOH", "rl": "RL", "lith_file": "Geology.csv", "lith": "Lith1" }
```

The keys are in `scripts/drillholes.mjs` (`importMxDeposit`). Or ask Claude Code: "map this MX Deposit export".

## 4. Preview, then load

```bash
npm run dh -- import mx-deposit --dir=imports/mx --project=KR --map=imports/mx-map.json --actor="Your name" --dry-run
npm run dh -- import mx-deposit --dir=imports/mx --project=KR --map=imports/mx-map.json --actor="Your name"
```

The import is safe to run twice: holes, surveys, intervals, samples and results already on file are left alone.

## What maps

- Holes with type, status, collar, datum, collar survey method, azimuth, dip, depths, dates, tenement, contractor and rig.
- Downhole surveys with the azimuth reference (true, magnetic or grid).
- Geology intervals with lithology, weathering, alteration and comments.
- Samples by type, with duplicates linked to their originals and standards to their names.
- Results by element, with below detection (`<0.01` or `-0.01`) kept as below detection.

## What does not carry over

- Dispatch dates. Batches named in the samples file are created with today as the sent date. Set the real sent, received and results dates, or the chain of custody check reads them wrong.
- Certified values for standards: add them from the certificates (step 2).
- Core photos, structure measurements, geotechnical logs and any custom tables. Ask for a table for each with `/customise` and bring the CSV across the same way.
- MX Deposit users, permissions and the activity feed.

Then run `/compliance` and `/qaqc` and work through what they find before anyone reports results from the new system.
