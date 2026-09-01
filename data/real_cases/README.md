# Real Market Cases

Each JSON file stores one observed market case. Numerical fields remain `null` until the original screenshot, broker record, preserved OHLC source, or another reliable source validates them.

- One setup may have zero, one, or many cases.
- Original and annotated screenshots are optional.
- Annotation coordinates live in `annotations/` and never alter the source image.
- Image paths are public paths under `/real-cases/<symbol>/` when assets become available.
- Aggregate statistics remain empty until a sufficiently validated sample exists.

## Source-backed FX cases

- `case_type: "historical_pattern"` means the case was reconstructed from preserved market OHLC data. It is not presented as an executed trade.
- `scripts/find-fx-real-cases.py` scans the preserved 12-pair FX D1/H1 archive with fixed Setup 08 rules.
- `generated/fx_scan_audit.json` records source hashes, row counts, incomplete-bar exclusions, criteria, candidate counts, and the selected case.
- Generated source and annotated charts live in `public/real-cases/` and can be reproduced by rerunning the scanner against the same hashed source files.
