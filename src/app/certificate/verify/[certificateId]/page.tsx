import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

export default async function VerifyCertificatePage({
  params
}: {
  params: { certificateId: string };
}) {
  // The only source of truth is the database — a well-formed ID in the
  // URL proves nothing on its own.
  const certificate = await prisma.certificate.findUnique({
    where: { certificateId: params.certificateId },
    include: { event: { select: { name: true, date: true } } }
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 py-16">
      <Link href="/" className="mb-8 self-start text-sm text-ink-400 hover:text-ink-900">
        ← Back
      </Link>

      {!certificate ? (
        <Card className="w-full text-center">
          <Badge tone="danger" className="mb-3">
            Certificate not found
          </Badge>
          <h1 className="font-display text-2xl text-ink-900">Certificate not found</h1>
          <p className="mt-2 text-sm text-ink-400">
            We could not find a certificate with this ID. Check the certificate ID and try again.
          </p>
          <Link href="/certificates" className="mt-6 inline-block">
            <Button variant="secondary">Search by name instead</Button>
          </Link>
        </Card>
      ) : certificate.status !== "VALID" ? (
        <Card className="w-full text-center">
          <Badge tone="danger" className="mb-3">
            Certificate revoked
          </Badge>
          <h1 className="font-display text-2xl text-ink-900">This certificate is no longer valid</h1>
          <p className="mt-2 text-sm text-ink-400">Certificate ID: {certificate.certificateId}</p>
        </Card>
      ) : (
        <Card className="w-full text-center">
          <Badge tone="success" className="mb-3">
            Certificate verified
          </Badge>
          <h1 className="font-display text-2xl text-ink-900">{certificate.participantName}</h1>
          <p className="mt-1 text-ink-400">{certificate.event.name}</p>

          <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-border pt-6 text-left">
            <div>
              <dt className="text-xs uppercase tracking-wide text-ink-400">Certificate ID</dt>
              <dd className="mt-1 font-medium text-ink-900">{certificate.certificateId}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-ink-400">Issue date</dt>
              <dd className="mt-1 font-medium text-ink-900">{formatDate(certificate.issueDate)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-ink-400">Event date</dt>
              <dd className="mt-1 font-medium text-ink-900">{formatDate(certificate.event.date)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-ink-400">Status</dt>
              <dd className="mt-1 font-medium text-success">VALID</dd>
            </div>
          </dl>

          <a href={`/api/certificate/file/${certificate.certificateId}`} target="_blank" rel="noreferrer" className="mt-6 inline-block">
            <Button>View certificate</Button>
          </a>
        </Card>
      )}
    </main>
  );
}
