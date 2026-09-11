"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { readError } from "@/lib/fetchJson";
import { DeleteAction } from "@/components/admin/DeleteAction";

/**
 * Archive is the reversible option and stays the default action; delete is
 * the irreversible one and is kept visually quieter so it is chosen, never
 * hit by accident.
 */
export function EventActions({
  eventId,
  eventName,
  status,
  certificateCount,
  batchCount
}: {
  eventId: string;
  eventName: string;
  status: string;
  certificateCount: number;
  batchCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const archived = status === "ARCHIVED";

  async function toggleArchive() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/events/${eventId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: archived ? "ACTIVE" : "ARCHIVED" })
      });
      if (!res.ok) throw new Error(await readError(res, "Could not update the event."));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the event.");
    } finally {
      setBusy(false);
    }
  }

  const impact =
    certificateCount === 0 && batchCount === 0
      ? "This event has no certificates, so only the event itself is removed."
      : `This permanently deletes ${certificateCount} certificate(s) and ${batchCount} batch(es), ` +
        "including their PDFs and ZIPs. Every verification link for those certificates will stop working.";

  return (
    <div className="flex w-full flex-wrap items-center justify-end gap-2">
      <Button variant="secondary" size="sm" disabled={busy} onClick={toggleArchive}>
        {busy ? "Saving…" : archived ? "Restore" : "Archive"}
      </Button>
      <DeleteAction
          endpoint={`/api/admin/events/${eventId}`}
          confirmWord={eventName}
          heading="Delete this event permanently?"
          description={impact}
        className="text-danger hover:bg-danger/10 hover:text-danger"
      />
      {error && <p className="w-full text-right text-xs text-danger">{error}</p>}
    </div>
  );
}
