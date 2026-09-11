import Link from "next/link";
import type { ReactNode, SVGProps } from "react";
import { Button } from "@/components/ui/Button";
import { Logo, LogoTile } from "@/components/Logo";
import { ScrollReveal } from "@/components/ScrollReveal";

/* -------------------------------------------------------------------------- */
/*  Icons — inline so the landing page pulls in no icon dependency.            */
/* -------------------------------------------------------------------------- */

function Icon({ children, ...props }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

const icons = {
  layout: (
    <Icon>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 21V9" />
    </Icon>
  ),
  sheet: (
    <Icon>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6M8 13h8M8 17h5" />
    </Icon>
  ),
  qr: (
    <Icon>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM21 14v3M18 21h3" />
    </Icon>
  ),
  shield: (
    <Icon>
      <path d="M12 3 4.5 6v5.5c0 4.3 3 8.2 7.5 9.5 4.5-1.3 7.5-5.2 7.5-9.5V6z" />
      <path d="m9 12 2 2 4-4" />
    </Icon>
  ),
  search: (
    <Icon>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Icon>
  ),
  check: (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.2 2.4 2.4 4.6-4.8" />
    </Icon>
  )
};

/* -------------------------------------------------------------------------- */
/*  Decorative QR mock for the hero certificate.                               */
/*  Deterministic (fixed seed) so server and client render identically.        */
/* -------------------------------------------------------------------------- */

const QR_SIZE = 21;

function qrModules() {
  const cells: Array<[number, number]> = [];
  let seed = 20250911;
  const next = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const isFinder = (x: number, y: number) =>
    (x < 7 && y < 7) || (x >= QR_SIZE - 7 && y < 7) || (x < 7 && y >= QR_SIZE - 7);

  for (let y = 0; y < QR_SIZE; y++) {
    for (let x = 0; x < QR_SIZE; x++) {
      if (isFinder(x, y)) continue;
      if (next() > 0.54) cells.push([x, y]);
    }
  }
  return cells;
}

function QrMark({ className }: { className?: string }) {
  const finders: Array<[number, number]> = [
    [0, 0],
    [QR_SIZE - 7, 0],
    [0, QR_SIZE - 7]
  ];

  return (
    <svg viewBox={"0 0 " + QR_SIZE + " " + QR_SIZE} className={className} aria-hidden="true">
      <rect width={QR_SIZE} height={QR_SIZE} fill="#ffffff" />
      {qrModules().map(([x, y]) => (
        <rect key={x + "-" + y} x={x} y={y} width="1" height="1" fill="#1B2430" />
      ))}
      {finders.map(([x, y]) => (
        <g key={"f" + x + "-" + y} fill="#1B2430">
          <path fillRule="evenodd" d={`M${x} ${y}h7v7h-7z M${x + 1} ${y + 1}v5h5v-5z`} />
          <rect x={x + 2} y={y + 2} width="3" height="3" />
        </g>
      ))}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Hero certificate preview                                                   */
/* -------------------------------------------------------------------------- */

function CertificatePreview() {
  return (
    <div className="relative mx-auto w-full max-w-md">
      {/* stacked sheets behind, hinting at a generated batch */}
      <div
        aria-hidden="true"
        className="absolute inset-x-6 -top-4 h-full rounded-lg border border-border bg-white/60 [transform:rotate(-3deg)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-3 -top-2 h-full rounded-lg border border-border bg-white/80 [transform:rotate(-1.4deg)]"
      />

      <div className="scan relative overflow-hidden rounded-lg border border-border bg-white p-2 shadow-[0_24px_60px_-24px_rgba(27,36,48,0.45)]">
        <div className="rounded border border-seal-light/70 p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-seal-dark">
                Certificate of Participation
              </p>
              <p className="mt-1 text-[11px] text-ink-400">Annual Tech Summit 2025</p>
            </div>
            <div className="h-12 w-12 shrink-0 rounded-sm border border-border p-[3px]">
              <QrMark className="h-full w-full" />
            </div>
          </div>

          <div className="mt-6">
            <p className="text-[10px] uppercase tracking-[0.18em] text-ink-400">Presented to</p>
            <p className="mt-1.5 font-display text-3xl leading-tight text-ink-900">
              Rahul Sharma
            </p>
          </div>

          <div className="mt-6 h-px bg-border" />

          <div className="mt-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.16em] text-ink-400">
                Certificate ID
              </p>
              <p className="mt-1 font-mono text-xs text-ink-900">CERT-2025-4K9X2M</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-[0.16em] text-ink-400">Issued</p>
              <p className="mt-1 text-xs text-ink-900">14 Mar 2025</p>
            </div>
            <div
              aria-hidden="true"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-seal-light bg-seal/5 text-[8px] font-semibold uppercase leading-tight tracking-wider text-seal-dark"
            >
              Seal
            </div>
          </div>
        </div>
      </div>

      {/* floating verification chip */}
      <div className="drift absolute -bottom-5 -left-4 flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 shadow-[0_14px_30px_-16px_rgba(27,36,48,0.5)] sm:-left-8">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-success/10 text-success">
          <span className="block h-4 w-4">{icons.check}</span>
        </span>
        <span className="text-left">
          <span className="block text-xs font-medium text-ink-900">Verified</span>
          <span className="block text-[10px] text-ink-400">Matched a live record</span>
        </span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Content                                                                    */
/* -------------------------------------------------------------------------- */

const STEPS = [
  {
    index: "1",
    title: "Design once",
    body: "Upload a template and drag each field into place."
  },
  {
    index: "2",
    title: "Upload the sheet",
    body: "Map your columns. Bad rows are flagged, never silently dropped."
  },
  {
    index: "3",
    title: "Generate and share",
    body: "PDFs, a ZIP of the batch, and a verify link for every certificate."
  }
];

const FEATURES = [
  {
    icon: icons.layout,
    title: "Visual template editor",
    body: "Drag every field into position. Nothing about your layout is hard-coded."
  },
  {
    icon: icons.sheet,
    title: "Bulk from a spreadsheet",
    body: "Map the columns once, then generate the whole batch in a click."
  },
  {
    icon: icons.qr,
    title: "QR on every PDF",
    body: "Each code opens that certificate's own verification page."
  },
  {
    icon: icons.shield,
    title: "Privacy-minded search",
    body: "Participants find theirs by name — no emails or phone numbers exposed."
  }
];

const VERIFY_ROWS: Array<[string, string]> = [
  ["Certificate ID", "CERT-2025-4K9X2M"],
  ["Participant", "Rahul Sharma"],
  ["Event", "Annual Tech Summit 2025"],
  ["Issued on", "14 March 2025"]
];

/* -------------------------------------------------------------------------- */
/*  Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Without JS the reveal elements would stay hidden, so switch them on. */}
      <noscript>
        <style>{`[data-reveal]{opacity:1!important;transform:none!important}`}</style>
      </noscript>
      <ScrollReveal />

      <header className="sticky top-0 z-30 border-b border-border/70 bg-paper/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/">
            <Logo />
          </Link>

          <nav className="hidden items-center gap-8 text-sm text-ink-400 md:flex">
            <a className="transition-colors hover:text-ink-900" href="#how-it-works">
              How it works
            </a>
            <a className="transition-colors hover:text-ink-900" href="#features">
              Features
            </a>
            <a className="transition-colors hover:text-ink-900" href="#verify">
              Verify
            </a>
          </nav>

          <div className="flex items-center gap-2">
            <Link href="/admin/login" className="hidden sm:block">
              <Button variant="ghost" size="sm">
                Admin sign in
              </Button>
            </Link>
            <Link href="/certificates">
              <Button size="sm">Find my certificate</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* ------------------------------- Hero ------------------------------ */}
        <section className="relative overflow-hidden">
          <div aria-hidden="true" className="hero-wash absolute inset-0" />
          <div aria-hidden="true" className="hero-grid absolute inset-0" />

          <div className="relative mx-auto grid max-w-6xl items-center gap-16 px-6 py-20 lg:grid-cols-[1.05fr_1fr] lg:py-28">
            <div className="rise">
              <span className="inline-flex items-center gap-2.5 rounded-full border border-seal-light/70 bg-white/70 px-3 py-1 text-xs text-seal-dark">
                <span className="ping relative h-1.5 w-1.5 rounded-full bg-seal" />
                Verified against a live record
              </span>

              <h1 className="mt-6 font-display text-4xl leading-[1.12] tracking-tight text-ink-900 sm:text-5xl lg:text-[3.4rem]">
                Certificates that are <span className="foil">genuinely verifiable</span>.
              </h1>

              <p className="mt-5 max-w-md text-base leading-relaxed text-ink-400">
                Turn one spreadsheet into a full batch of certificates — each with
                a unique ID and a QR code that resolves to a real database record.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href="/certificates">
                  <Button size="md" className="px-5 py-2.5">
                    <span className="block h-4 w-4">{icons.search}</span>
                    Find my certificate
                  </Button>
                </Link>
                <Link href="/admin/login">
                  <Button variant="secondary" size="md" className="px-5 py-2.5">
                    Admin sign in
                  </Button>
                </Link>
              </div>

              <p className="mt-4 text-xs text-ink-400">
                No account needed — search with the name you registered with.
              </p>
            </div>

            <div className="rise [animation-delay:140ms]">
              <CertificatePreview />
            </div>
          </div>
        </section>

        {/* ---------------------------- How it works ------------------------- */}
        <section id="how-it-works" className="border-t border-border bg-white">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <h2
              data-reveal
              className="font-display text-3xl leading-tight text-ink-900 sm:text-4xl"
            >
              Three steps, start to finish
            </h2>

            <ol className="mt-12 grid gap-10 sm:grid-cols-3 sm:gap-8">
              {STEPS.map((step, i) => (
                <li
                  key={step.index}
                  data-reveal
                  style={{ transitionDelay: `${i * 110}ms` }}
                  className="relative"
                >
                  <span className="grid h-9 w-9 place-items-center rounded-full border border-seal-light bg-paper font-display text-sm text-seal-dark">
                    {step.index}
                  </span>
                  <h3 className="mt-4 font-display text-lg text-ink-900">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-400">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ------------------------------ Features --------------------------- */}
        <section id="features" className="border-t border-border">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <h2
              data-reveal
              className="font-display text-3xl leading-tight text-ink-900 sm:text-4xl"
            >
              Built for the whole issuing process
            </h2>

            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((feature, i) => (
                <div
                  key={feature.title}
                  data-reveal
                  style={{ transitionDelay: `${i * 90}ms` }}
                  className="lift group rounded-lg border border-border bg-white p-6 hover:border-seal-light"
                >
                  <span className="grid h-10 w-10 place-items-center rounded border border-border bg-paper text-seal-dark transition-colors group-hover:border-seal-light group-hover:bg-seal/5">
                    <span className="block h-5 w-5">{feature.icon}</span>
                  </span>
                  <h3 className="mt-4 font-display text-lg text-ink-900">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-400">{feature.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* --------------------- Verification, and the last CTA -------------- */}
        <section id="verify" className="border-t border-border bg-ink-900 text-paper">
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 py-20 lg:grid-cols-2">
            <div data-reveal>
              <h2 className="font-display text-3xl leading-tight sm:text-4xl">
                A well-formatted ID proves nothing
              </h2>
              <p className="mt-5 max-w-md text-sm leading-relaxed text-ink-100/75">
                Anyone can invent a code that looks right. Every check hits the
                database and answers plainly — verified, revoked, or not found.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href="/certificates">
                  <Button variant="inverse" size="md" className="px-5 py-2.5">
                    <span className="block h-4 w-4">{icons.search}</span>
                    Find my certificate
                  </Button>
                </Link>
                <Link href="/admin/login">
                  <Button variant="outline" size="md" className="px-5 py-2.5">
                    Admin sign in
                  </Button>
                </Link>
              </div>
            </div>

            <div
              data-reveal
              style={{ transitionDelay: "120ms" }}
              className="rounded-lg border border-white/10 bg-white/[0.04] p-6 sm:p-8"
            >
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-success/20 text-success">
                  <span className="block h-5 w-5">{icons.check}</span>
                </span>
                <div>
                  <p className="font-display text-xl">Certificate verified</p>
                  <p className="text-xs text-ink-100/60">Matched an issued record</p>
                </div>
              </div>

              <dl className="mt-7 space-y-4 border-t border-white/10 pt-6 text-sm">
                {VERIFY_ROWS.map(([label, value]) => (
                  <div key={label} className="flex items-baseline justify-between gap-6">
                    <dt className="text-ink-100/55">{label}</dt>
                    <dd className="text-right font-medium text-paper">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <LogoTile className="h-9 w-9" />
            <div>
              <p className="max-w-md text-xs leading-relaxed text-ink-400">
                Certificates are verified against a database record, not just a
                correctly formatted ID.
              </p>
              <p className="mt-1.5 text-[11px] text-ink-400/80">
                An Encypherist project —{" "}
                <span className="italic">because geeks are code blooded.</span>
              </p>
            </div>
          </div>
          <nav className="flex items-center gap-6 text-xs text-ink-400">
            <Link className="transition-colors hover:text-ink-900" href="/certificates">
              Find a certificate
            </Link>
            <Link className="transition-colors hover:text-ink-900" href="/admin/login">
              Admin
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
