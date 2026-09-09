import Link from "next/link";
import { prisma, safeQuery, isDbConfigured } from "@/lib/db";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

export default async function AdminDashboardPage() {
  const dbOff = !isDbConfigured();

  const [eventCount, templateCount, certificateCount, recentBatches] = await Promise.all([
    safeQuery(() => prisma.event.count({ where: { status: "ACTIVE" } }), 0),
    safeQuery(() => prisma.template.count(), 0),
    safeQuery(() => prisma.certificate.count(), 0),
    safeQuery(
      () =>
        prisma.generationBatch.findMany({
          orderBy: { createdAt: "desc" },
          take: 5,
          include: { event: { select: { name: true } } }
        }),
      [] as { id: string; successCount: number; failedCount: number; status: string; event: { name: string } }[]
    )
  ]);

  return (
    <div>
      <h1 className="font-display text-2xl text-ink-900">Dashboard</h1>

      {dbOff && (
        <Alert tone="neutral" className="mt-4">
          Running without a database. Sign-in uses the credentials in your environment;
          events, templates, and certificate generation stay unavailable until Postgres
          is configured and migrated.
        </Alert>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs uppercase tracking-wide text-ink-400">Active events</p>
          <p className="mt-2 font-display text-3xl text-ink-900">{eventCount}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-ink-400">Templates</p>
          <p className="mt-2 font-display text-3xl text-ink-900">{templateCount}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-ink-400">Certificates issued</p>
          <p className="mt-2 font-display text-3xl text-ink-900">{certificateCount}</p>
        </Card>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/admin/events/new">
          <Button>+ Create event</Button>
        </Link>
        <Link href="/admin/templates/new">
          <Button variant="secondary">+ Create template</Button>
        </Link>
        <Link href="/admin/certificates/generate">
          <Button variant="secondary">Generate certificates</Button>
        </Link>
      </div>

      <div className="mt-10">
        <h2 className="text-sm font-medium text-ink-700">Recent generation batches</h2>
        <div className="mt-3 space-y-2">
          {recentBatches.length === 0 && (
            <p className="text-sm text-ink-400">No certificates generated yet.</p>
          )}
          {recentBatches.map((batch) => (
            <Card key={batch.id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-ink-900">{batch.event.name}</p>
                <p className="text-xs text-ink-400">
                  {batch.successCount} generated
                  {batch.failedCount > 0 ? `, ${batch.failedCount} skipped` : ""} ·{" "}
                  {batch.status}
                </p>
              </div>
              <Link href="/admin/certificates/generated" className="text-sm text-seal-dark hover:underline">
                View
              </Link>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
