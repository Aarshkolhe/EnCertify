import Link from "next/link";
import { prisma, safeQuery, isDbConfigured } from "@/lib/db";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import clsx from "clsx";

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

  const stats = [
    { label: "Active events", value: eventCount, href: "/admin/events" },
    { label: "Templates", value: templateCount, href: "/admin/templates" },
    {
      label: "Certificates issued",
      value: certificateCount,
      href: "/admin/certificates/issued"
    }
  ];

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-400">
        Overview
      </p>
      <h1 className="mt-1 font-display text-3xl text-ink-900">Dashboard</h1>

      {dbOff && (
        <Alert tone="neutral" className="mt-4">
          Running without a database. Sign-in uses the credentials in your environment;
          events, templates, and certificate generation stay unavailable until Postgres
          is configured and migrated.
        </Alert>
      )}

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href} className="group">
            <Card className="lift h-full group-hover:border-ink-400/40">
              <p className="text-xs uppercase tracking-wide text-ink-400">{stat.label}</p>
              <p className="mt-2 font-display text-4xl text-ink-900">{stat.value}</p>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-8 rounded-lg border border-border bg-white p-5">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-ink-400">
          Quick actions
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
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
      </div>

      <div className="mt-10">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-lg text-ink-900">Recent generation batches</h2>
          {recentBatches.length > 0 && (
            <Link
              href="/admin/certificates/generated"
              className="text-xs text-ink-400 transition-colors hover:text-ink-900"
            >
              View all
            </Link>
          )}
        </div>

        <div className="mt-3 overflow-hidden rounded-lg border border-border bg-white">
          {recentBatches.length === 0 && (
            <p className="p-6 text-sm text-ink-400">No certificates generated yet.</p>
          )}
          {recentBatches.map((batch, i) => (
            <Link
              key={batch.id}
              href="/admin/certificates/generated"
              className={clsx(
                "flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-ink-900/[0.03]",
                i > 0 && "border-t border-border"
              )}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink-900">{batch.event.name}</p>
                <p className="text-xs text-ink-400">
                  {batch.successCount} generated
                  {batch.failedCount > 0 ? `, ${batch.failedCount} skipped` : ""}
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
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
