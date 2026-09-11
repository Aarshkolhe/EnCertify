import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EventActions } from "@/components/admin/EventActions";

export default async function AdminEventsPage() {
  const events = await prisma.event.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { certificates: true, batches: true } } }
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-ink-900">Events</h1>
        <Link href="/admin/events/new">
          <Button>+ Create event</Button>
        </Link>
      </div>

      <div className="mt-6 space-y-3">
        {events.length === 0 && (
          <Card>
            <p className="text-sm text-ink-400">
              No events yet. Create one before generating certificates.
            </p>
          </Card>
        )}
        {events.map((event) => (
          <Card key={event.id}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-medium text-ink-900">{event.name}</p>
                <p className="text-sm text-ink-400">
                  {new Date(event.date).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "long",
                    year: "numeric"
                  })}{" "}
                  · {event._count.certificates} certificates issued
                </p>
              </div>
              <Badge tone={event.status === "ACTIVE" ? "success" : "neutral"}>
                {event.status}
              </Badge>
            </div>
            <div className="mt-4 border-t border-border pt-3">
              <EventActions
                eventId={event.id}
                eventName={event.name}
                status={event.status}
                certificateCount={event._count.certificates}
                batchCount={event._count.batches}
              />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
