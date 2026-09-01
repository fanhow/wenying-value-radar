# Real Case Images

Place immutable source screenshots under a symbol folder, for example:

- `/real-cases/usd_jpy/original.png`
- `/real-cases/avgo/original.png`

Optional pre-rendered annotated screenshots may live beside the original. Editable annotations belong in `data/real_cases/annotations/`, not in the source image.

Source-backed historical reconstructions may also live directly in this folder. The USDJPY files are generated from the preserved FX D1/H1 archive by `scripts/find-fx-real-cases.py`; they are evidence of a historical market pattern, not broker execution screenshots.
