# batch — bulk certificate generation

Drop two files in this folder and run one command. No database, no dev server,
no login required.

```
batch/
├── template.png       ← the certificate design (PNG or JPG)
├── participants.xlsx  ← the sheet of names (.xlsx / .xls / .csv)
├── layout.json        ← where the name is drawn
├── fonts/             ← optional .ttf/.otf to match the template exactly
└── out/               ← generated certificates + certificates.zip
```

## 1. Check the placement

```bash
npm run certs:preview
```

Writes `out/_preview-1.png` … `_preview-3.png` — the template with sample names
drawn on it, plus a dashed red box showing the area the name is fitted into.
No certificates are generated.

If the name sits wrong, edit `layout.json` and run the preview again. Every
number is a **fraction of the template's own size**, so the same config keeps
working if the template is re-exported at a different resolution:

| Key | Meaning |
| --- | --- |
| `centerX` | horizontal centre — `0.5` is the middle of the page |
| `centerY` | vertical centre — lower value = higher up the page |
| `maxWidth` | width the name must fit inside; it shrinks automatically |
| `fontSize` | fraction of template height |
| `minFontSize` | shrink floor — a name still too wide here wraps to two lines |
| `fontFamily` | any font installed on this machine |
| `fontFile` | e.g. `batch/fonts/Cormorant.ttf`, to match the template's font |
| `color` | hex, e.g. `#1B2430` |
| `uppercase` | `true` renders names in caps |

`output` controls what gets written: `pdf`, `png`, `zip` (any combination).

## 2. Generate

```bash
npm run certs
```

One file per participant in `out/`, named after them, plus `certificates.zip`
with the whole batch.

The name column is auto-detected (a header called `Name`, `Participant Name`,
`Full Name`, or the first header containing "name"). To point at a specific
column:

```bash
npm run certs -- --column "Student Name"
```

Blank names and exact duplicate rows are skipped and reported with their sheet
row numbers; every other row still generates.

## Other paths

```bash
npm run certs -- --template path/to/design.png --excel path/to/list.xlsx --out path/to/dir
```
