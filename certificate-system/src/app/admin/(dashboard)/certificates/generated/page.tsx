import { prisma } from "@/lib/db";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

export default async function GeneratedCertificatesPage() {
  const batches = await prisma.generationBatch.findMany({
    orderBy: { createdAt: "desc" },
    include: { event: { select: { name: true } }, template: { select: { name: true } } }
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
          <Card key={batch.id} className="flex items-center justify-between">
            <div>
              <p className="font-medium text-ink-900">{batch.event.name}</p>
              <p className="text-sm text-ink-400">
                {batch.template.name} · {batch.successCount} generated
                {batch.failedCount > 0 ? `, ${batch.failedCount} skipped` : ""} ·{" "}
                {new Date(batch.createdAt).toLocaleString("en-GB")}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge tone={batch.status === "COMPLETED" ? "success" : batch.status === "FAILED" ? "danger" : "neutral"}>
                {batch.status}
              </Badge>
              {batch.zipUrl && (
                <a href={`/api/admin/certificates/download-zip/${batch.id}`}>
                  <Button variant="secondary" size="sm">
                    Download ZIP
                  </Button>
                </a>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
