# Certify — Certificate Issuance & Verification System

A standalone, self-hostable full-stack app for issuing event certificates in
bulk and letting participants find and verify them. Built fresh (no existing
project was supplied to integrate into) using **Next.js 14 (App Router) +
Prisma + PostgreSQL**, per your choice.

---

## 1. Summary — what was implemented

**Admin side**
- Email/password admin login (bcrypt + signed session cookie), protected by
  both edge middleware (UX-level redirect) and a server-side DB check on
  every single admin API route and page (the two are independent — the
  middleware check alone is never trusted).
- Event management: create/list/archive events.
- Certificate template management: upload a PNG/JPG/PDF template (PDFs are
  rasterized server-side via `pdftoppm` so every template — image or PDF —
  flows through one rendering pipeline), then a drag-and-drop field editor
  to position Participant Name, Certificate ID, Event Name, Event Date, and
  Certificate Issue Date, with per-field font size/family/alignment/
  bold/italic/color, plus a draggable, resizable QR code box. Positions are
  stored as JSON on the template and reused on every future generation —
  nothing is hard-coded.
- Excel upload → column mapping → validated participant preview → one-click
  batch generation. Validation catches missing names, duplicate rows, and
  reports exactly which rows were skipped and why, without blocking the
  rows that are valid.
- Certificate generation is entirely server-side: unique certificate IDs
  (`CERT-<year>-<6 chars>`, collision-checked against the DB with retry,
  never accepted from the client), rendered PDFs (canvas composite → single
  embedded-image PDF page) with an embedded QR code linking to the public
  verification page, one DB row per certificate, and a ZIP of the whole
  batch.
- Generated-batches list with ZIP re-download.

**Student side**
- Public search by name (case/whitespace-insensitive exact match — no
  partial/fuzzy matching, so the endpoint can't be used to browse
  unrelated participants) → list of events they have a certificate for →
  certificate(s) for the chosen event → view / download / verify.
- Public, database-backed verification page and API at
  `/certificate/verify/:certificateId` — a well-formatted ID alone proves
  nothing; the page always checks the DB and clearly distinguishes "not
  found" from "verified" from "revoked", without leaking internals.

**Security**
- Every admin mutation re-validates input with `zod` server-side.
- File uploads are extension- and size-limited; stored under random UUID
  filenames outside `public/`, and only ever served back out through API
  routes that resolve a filename against the DB record first (no raw path
  ever comes from the client, so there's no path-traversal surface).
- The student search/by-event/verify endpoints return only the minimum
  fields needed (name, event, certificate ID, dates) — never email, phone,
  or other participant details collected in the spreadsheet.
- Errors shown to users are friendly, fixed strings; nothing from
  exceptions or stack traces is ever sent to the client.

---

## 2. Project layout (everything is new)

```
certificate-system/
├── prisma/
│   ├── schema.prisma          Admin, Event, Template, Certificate, GenerationBatch
│   └── seed.ts                 creates the first admin from env vars
├── sample-data/
│   └── sample-participants.xlsx  5 rows incl. one blank name + one duplicate, for testing
├── src/
│   ├── middleware.ts            edge-level /admin/* gate (UX only, not the real check)
│   ├── lib/                     db, auth, apiAuth, certId, excelParser, storage,
│   │                            templateUpload, pdfPreview, fieldTypes,
│   │                            certificateRenderer, zip, generation, validators, dates
│   ├── components/
│   │   ├── admin/               AdminNav, FieldEditor (the drag/drop editor)
│   │   ├── student/              (search flow lives inline in the page — see below)
│   │   └── ui/                   Button, Card, Input, Badge, Alert
│   └── app/
│       ├── page.tsx              public landing page
│       ├── certificates/         student search → events → certificates flow
│       ├── certificate/verify/[certificateId]/  public verification page
│       ├── admin/
│       │   ├── login/
│       │   └── (dashboard)/      layout.tsx does the real server-side auth check
│       │       ├── page.tsx (dashboard), events/, templates/, certificates/
│       └── api/
│           ├── auth/             login, logout, me
│           ├── admin/            events, templates (+ upload, + preview),
│           │                     certificates (parse-excel, generate, download-zip)
│           └── certificates|certificate/   public search, by-event, verify, file
└── storage/                     runtime file storage (gitignored) — templates,
                                   certificates, zips, tmp excel uploads
```

---

## 3. Database (Prisma / PostgreSQL)

Five models — see `prisma/schema.prisma` for full detail:

- **Admin** — email (unique), bcrypt password hash, name.
- **Event** — name, date, description, status (ACTIVE/ARCHIVED).
- **Template** — normalized background PNG (`fileUrl`), pixel dimensions,
  `fields` (JSON array of field configs: key, x, y, fontSize, fontFamily,
  align, bold, italic, color), QR settings.
- **Certificate** — `certificateId` (**unique** constraint), participant
  name + a lowercased/trimmed `participantNameNormalized` (indexed, used
  for search), optional email, foreign keys to Event/Template, generated
  file path, issue date, status (VALID/REVOKED), and an optional link to
  the GenerationBatch it came from.
- **GenerationBatch** — one row per "Generate Certificates" click: counts,
  the row-level error list, the resulting ZIP path, and status.

Indexes: `participantNameNormalized`, `eventId`, `batchId` on Certificate;
unique on `Certificate.certificateId` and `Admin.email`.

No migration history is included since this is a fresh schema — running
`npm run prisma:migrate` (below) creates the initial migration.

---

## 4. Dependencies and why

| Package | Why |
|---|---|
| `next`, `react`, `react-dom` | app framework |
| `@prisma/client`, `prisma` | ORM / migrations, matches your chosen stack |
| `bcryptjs` | password hashing (pure JS, no native build step) |
| `jose` | signs/verifies the admin session JWT — works identically in Node API routes *and* the Edge middleware, unlike `jsonwebtoken` |
| `zod` | server-side validation of every API input |
| `xlsx` (SheetJS) | reads `.xlsx`/`.xls` participant files |
| `@napi-rs/canvas` | composites certificate text/QR onto the template image — ships prebuilt binaries, no native compiler needed on the host |
| `qrcode` | generates the verification QR code |
| `pdf-lib` | wraps the final composited image into a single-page PDF |
| `archiver` | builds the ZIP of generated certificates |
| `nanoid`, `uuid` | certificate ID suffixes / random storage filenames |
| `clsx` | conditional Tailwind class names |
| `tailwindcss` | styling |

**System dependency (not npm):** `poppler-utils` — only needed if admins
upload **PDF** templates (PNG/JPG templates never need it). Install with:

```bash
# Debian/Ubuntu
sudo apt-get update && sudo apt-get install -y poppler-utils
```

---

## 5. Environment variables

See `.env.example`. Copy it to `.env` and fill in real values:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | long random string signing admin sessions — **do not commit a real value** |
| `NEXT_PUBLIC_APP_URL` | public base URL, used to build the QR verification link |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME` | used once by `npm run seed` to create the first admin account |

---

## 6. How to run

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# edit .env: set DATABASE_URL, a real JWT_SECRET, and your seed admin credentials

# 3. (Only if you'll upload PDF templates) install poppler-utils — see above

# 4. Create the database schema
npm run prisma:migrate

# 5. Create the first admin account
npm run seed

# 6. Run it
npm run dev          # development, http://localhost:3000
# or
npm run build && npm run start   # production
```

Sign in at `/admin/login` with the `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`
you set. Students use `/` → "Find my certificate".

A ready-made test spreadsheet is at `sample-data/sample-participants.xlsx`
(3 valid rows, 1 row with a missing name, 1 exact-duplicate row) for
exercising the Excel validation described below.

---

## 7. Testing performed, and what's environment-limited

**What I could verify in this sandbox:**
- `npm install` succeeds; `npx next build` compiles every route and
  component cleanly (module resolution, JSX, the native-binary externals
  config for `@napi-rs/canvas`, etc. all check out) once TypeScript's
  build-time type check is bypassed.
- The Excel parsing/validation logic, ID generator, storage path-safety
  helpers, and renderer were reviewed line-by-line against the spec.

**What I could *not* run end-to-end here, and why:** this sandbox's network
allowlist doesn't include `binaries.prisma.sh`, which `prisma generate`
needs to download its query engine — so I couldn't generate a real,
schema-specific Prisma Client or exercise a live Postgres database in this
environment. This is a sandbox restriction, not a code issue: it's a
standard, one-time download that will succeed on your machine or CI the
moment you run `npm run prisma:migrate` / `npm run prisma:generate` with
normal internet access. Because of this I couldn't run a full
`tsc`/production type-check against the real generated types either — the
build shown above has type-checking temporarily disabled for that one
verification run only; the shipped `next.config.js` does **not** disable it.

**Recommended first real test pass once you have Postgres available**,
following the flow the spec asks for:

1. `npm run prisma:migrate && npm run seed`, then `npm run dev`.
2. Admin: log in → create event "Tech Fest 2026" → upload a template image
   → position the 4 default fields + add "Certificate Issue Date" → save.
3. Admin → Generate certificates → pick the event/template → upload
   `sample-data/sample-participants.xlsx` → map `Name`/`Email` → generate.
   Expect: **3 succeeded**, **2 skipped** (missing name, duplicate row),
   with reasons shown, and a ZIP download.
4. Student: `/certificates` → search "Rahul Sharma" → select the event →
   view/download/verify the certificate.
5. Negative tests: search a name with no certificates; open
   `/certificate/verify/CERT-2026-DOESNOTEXIST`; try any `/api/admin/*`
   route without a session cookie (should 401); re-upload the same Excel
   file (duplicates across the whole batch are still caught within a
   single generation run, since they're checked against rows already seen
   in that file).

---

## 8. Notes on scope decisions

- **Both PNG/JPG and PDF templates render through one pipeline**: a PDF
  upload is rasterized once (via `pdftoppm`) into the same kind of PNG
  background an image upload would produce, so the field editor is always
  positioning against pixels, and generation always composites the same
  way. This trades a small amount of PDF vector fidelity for a
  single, predictable, WYSIWYG rendering path — reasonable for certificates,
  which are short-lived, print-oriented documents rather than long text
  documents where vector fidelity matters.
- **Generation runs synchronously in the API request** rather than a
  background job queue, since nothing in a from-scratch build justified
  adding a queue/worker system yet; the route's `maxDuration` is raised and
  the UI shows a clear "Generating…" state. If you expect batches in the
  thousands routinely, swapping `runGenerationBatch` to run inside a job
  queue (e.g. BullMQ) is a contained change — the function is already a
  single, self-contained unit.
- **Duplicate detection** is exact (same name + email) within one upload,
  and rows without a resolvable name are always skipped — nothing is
  generated until you explicitly click "Generate Certificates" on the
  reviewed preview.
