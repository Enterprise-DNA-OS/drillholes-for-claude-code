# Rules this system checks

Checked 15 October 2026. Two sources set most of these rules, plus house limits you set yourself:

- **The JORC Code (2012 edition), Table 1, Section 1: Sampling Techniques and Data.** The checklist a competent person answers for every public report of exploration results in Australia and New Zealand: drilling techniques, drill sample recovery, logging, sub-sampling, quality of assay data and laboratory tests, verification, location of data points and sample security. Published by the Joint Ore Reserves Committee at [jorc.org](https://www.jorc.org/docs/JORC_code_2012.pdf).
- **Guidelines for Mineral Exploration Reports on Mining Tenements**, Department of Mines, Petroleum and Exploration, Western Australia, gazetted October 2025 under section 115A of the Mining Act 1978 and regulation 96B of the Mining Regulations 1981 ([wa.gov.au](https://www.wa.gov.au/system/files/2025-10/mineral-exploration-tenements-guideline.pdf)). It says: "An Annual Mineral Exploration report must be submitted no later than 60 days after each anniversary date of the commencement of the tenement", "An extension of time to file a mineral exploration report will not be granted", locational data must record the geodetic datum (GDA2020), and "All azimuths in directional downhole surveys must be given in relation to True North (i.e. gyro) or Magnetic North (i.e. compass)".
- **Rehabilitation.** WA tenement conditions commonly require drill holes to be capped or made safe straight after drilling and disturbance rehabilitated within six months (the department's Exploration and Prospecting Rehabilitation Guidance). Your own tenement conditions are what apply: set `rehab_days` to match them.

`npm run dh -- compliance` runs every check below. It reads your records. It does not replace a competent person's sign-off, and it does not certify that you meet any law. Outside Western Australia, change `report_due_days` and the DATUM rule to your state's or New Zealand's rules with `/customise`.

| Rule | What the data must show | Source |
|---|---|---|
| COLLAR_SURVEY | A completed hole has a surveyed collar (GPS, DGPS, RTK or total station), not its planned position. | JORC Table 1, Location of data points |
| DATUM | A completed hole on a WA tenement has its collar in GDA2020. | WA guidelines, Locational information and maps |
| DOWNHOLE_SURVEY | A completed hole deeper than `downhole_survey_min_depth` (30 m) has at least one downhole survey. | JORC Table 1, Location of data points (down-hole surveys) |
| AZIMUTH_REFERENCE | Every downhole survey says whether its azimuth is true, magnetic or grid. `add-survey` refuses without it. | WA guidelines, Locational information and maps |
| LOGGING | A completed hole is logged from collar to end of hole. | JORC Table 1, Logging |
| INTERVALS | Logging intervals start at the collar and run without gaps or overlaps; sampling intervals do not overlap or run past the end of the hole. `log-interval` and `sample-hole` refuse overlaps. | Data check |
| RECOVERY | Every RC and diamond sample has its recovery recorded. | JORC Table 1, Drill sample recovery |
| CHAIN_OF_CUSTODY | A batch sent to the lab has the lab's receipt within `dispatch_receipt_days` (7). | JORC Table 1, Sample security |
| RESULTS_LATE | A batch at the lab has results within `results_due_days` (21). | House standard |
| QC_STANDARD | No certified standard is more than `standard_fail_sd` (3) standard deviations from its certified value. Over `standard_warn_sd` (2) shows as a warning in `qaqc`. | JORC Table 1, Quality of assay data and laboratory tests; the limits are yours |
| QC_BLANK | No blank reports above `blank_fail_multiple` (5) times the detection limit. | As above |
| QC_DUPLICATE | No field duplicate differs from its original by more than `duplicate_fail_pct` (30) per cent of the pair's mean. | JORC Table 1, Sub-sampling techniques and sample preparation; the limit is yours |
| QC_RATE | Each batch carries a standard every `qc_standard_every` (20) samples, a blank every `qc_blank_every` (40) and a duplicate every `qc_duplicate_every` (20). | As above; the rates are yours |
| HOLE_NOT_CAPPED | A completed or abandoned hole is capped. | WA rehabilitation guidance and tenement conditions |
| REHABILITATION | A completed or abandoned hole is rehabilitated within `rehab_days` (180), flagged 30 days ahead. | Standard WA tenement condition (six months) |
| REPORT_DUE | Each live tenement's annual report is lodged within `report_due_days` (60) of its anniversary, flagged `report_notice_days` (45) ahead. The first year after grant has no report yet. | WA guidelines, Submission dates |

The pending-results rule in the WA guidelines ("Where downhole drilling assay results are not available at the time of reporting, they must be submitted in the following year's annual mineral exploration report and must be accompanied by the associated collar file") is why `report-files` lists the holes with results still to come.
