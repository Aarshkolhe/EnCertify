import { prisma } from "@/lib/db";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CertificateActions } from "@/components/admin/CertificateActions";

const PAGE_SIZE = 50;

export default async function IssuedCertificatesPage({
  searchParams
}: {
  searchParams: { q?: string };
}) {
  const q = (searchParams.q || "").trim();

  // Admin-side search is allowed to be partial, unlike the public endpoint,
  // which stays an exact match so it cannot be used to browse participants.
  const where = q
    ? {
        OR: [
          { participantNameNormalized: { contains: q.toLowerCase() } },
          { certificateId: { contains: q.toUpperCase() } }
        ]
      }
    : {};

  const [certificates, total] = await Promise.all([
    prisma.certificate.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      include: { event: { select: { name: true } } }
    }),
    prisma.certificate.count({ where })
  ]);

  return (
    <div>
      <h1 className="font-display text-2xl text-ink-900">Issued certificates</h1>
      <p className="mt-1 text-sm text-ink-400">
        Delete a single certificate, or revoke it to keep the record and have
        verification report it as revoked.
      </p>

      <form className="mt-6 flex gap-2" action="/admin/certificates/issued">
        <Input
          name="q"
          defaultValue={q}
          placeholder="Search by participant name or certificate ID"
          className="max-w-md"
        />
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      <p className="mt-4 text-xs text-ink-400">
        {total === 0
          ? "No certificates match."
          : `${total} certificate(s)${total > PAGE_SIZE ? ` — showing the ${PAGE_SIZE} most recent` : ""}.`}
      </p>

      <div className="mt-4 space-y-3">
        {certificates.map((certificate) => (
          <Card key={certificate.id}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-medium text-ink-900">{certificate.participantName}</p>
                <p className="text-sm text-ink-400">
                  {certificate.event.name} ·{" "}
                  <span className="font-mono">{certificate.certificateId}</span> ·{" "}
                  {new Date(certificate.issueDate).toLocaleDateString("en-GB")}
                </p>
              </div>
              <Badge tone={certificate.status === "VALID" ? "success" : "danger"}>
                {certificate.status}
              </Badge>
            </div>

            <div className="mt-4 border-t border-border pt-3">
              <CertificateActions
                certificateId={certificate.id}
                publicId={certificate.certificateId}
                participantName={certificate.participantName}
                status={certificate.status}
              />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
