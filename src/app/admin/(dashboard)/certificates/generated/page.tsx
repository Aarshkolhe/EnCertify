import { prisma } from "@/lib/db";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DeleteAction } from "@/components/admin/DeleteAction";

export default async function GeneratedCertificatesPage() {
  const batches = await prisma.generationBatch.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      event: { select: { name: true } },
      template: { select: { name: true } },
      _count: { select: { certificates: true } }
    }
  });

  return (
    <div>
      <h1 className="font-display text-2xl text-ink-900">Generated batches</h1>

      <div className="mt-6 space-y-3">
        {batches.length === 0 && (
          <Card>
            <p className="text-sm text-ink-400">No certificates generated yet.</p>
          </Card>
        )}
        {batches.map((batch) => (
          <Card key={batch.id}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-medium text-ink-900">{batch.event.name}</p>
                <p className="text-sm text-ink-400">
                  {batch.template.name} · {batch._count.certificates} certificates
                  {batch.failedCount > 0 ? `, ${batch.failedCount} skipped` : ""} ·{" "}
                  {new Date(batch.createdAt).toLocaleString("en-GB")}
                </p>
              </div>
              <Badge
                tone={
                  batch.status === "COMPLETED"
                    ? "success"
                    : batch.status === "FAILED"
                      ? "danger"
                      : "neutral"
                }
              >
                {batch.status}
              </Badge>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
              {batch.zipUrl && (
                <a href={`/api/admin/certificates/download-zip/${batch.id}`}>
                  <Button variant="secondary" size="sm">
                    Download ZIP
                  </Button>
                </a>
              )}
              <DeleteAction
                endpoint={`/api/admin/certificates/batches/${batch.id}`}
                label="Delete batch"
                heading="Delete this batch permanently?"
                description={`This removes the batch, its ${batch._count.certificates} certificate record(s), their PDFs and the ZIP. Every verification link for those certificates will stop working.`}
                className="text-danger hover:bg-danger/10 hover:text-danger"
              />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
