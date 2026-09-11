"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { readError } from "@/lib/fetchJson";
import { DeleteAction } from "@/components/admin/DeleteAction";

/**
 * Revoke is almost always the right action for a certificate already in
 * someone's hands: the record survives, so verification answers "revoked"
 * rather than "not found", which is the stronger and more honest signal.
 * Delete is for certificates issued in error that were never handed out.
 */
export function CertificateActions({
  certificateId,
  publicId,
  participantName,
  status
}: {
  certificateId: string;
  publicId: string;
  participantName: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const revoked = status === "REVOKED";

  async function toggleRevoked() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/certificates/${certificateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: revoked ? "VALID" : "REVOKED" })
      });
      if (!res.ok) throw new Error(await readError(res, "Could not update the certificate."));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the certificate.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex w-full flex-wrap items-center justify-end gap-2">
      <a href={`/certificate/verify/${publicId}`} target="_blank" rel="noreferrer">
        <Button variant="secondary" size="sm">
          View verification
        </Button>
      </a>
      <Button variant="secondary" size="sm" disabled={busy} onClick={toggleRevoked}>
        {busy ? "Saving…" : revoked ? "Restore to valid" : "Revoke"}
      </Button>
      <DeleteAction
        endpoint={`/api/admin/certificates/${certificateId}`}
        heading="Delete this certificate permanently?"
        description={`The record for ${participantName} (${publicId}) and its PDF are removed. Its verification link will stop working. To keep the record but mark it invalid, use Revoke instead.`}
        className="text-danger hover:bg-danger/10 hover:text-danger"
      />
      {error && <p className="w-full text-right text-xs text-danger">{error}</p>}
    </div>
  );
}
