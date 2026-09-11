"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { readError } from "@/lib/fetchJson";

/**
 * A delete button that will not fire until the admin has confirmed in place.
 *
 * When `confirmWord` is set the admin must retype it exactly, and the value
 * is forwarded to the API as `?confirm=`. The server checks it too — this
 * component is a guard against misclicks, not an access control.
 */
export function DeleteAction({
  endpoint,
  label = "Delete",
  heading,
  description,
  confirmWord,
  className
}: {
  endpoint: string;
  label?: string;
  heading: string;
  description: string;
  confirmWord?: string;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const armed = !confirmWord || typed === confirmWord;

  function cancel() {
    setOpen(false);
    setTyped("");
    setError(null);
  }

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const url = confirmWord
        ? `${endpoint}?confirm=${encodeURIComponent(typed)}`
        : endpoint;
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) throw new Error(await readError(res, "Could not delete."));
      cancel();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className={className}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
    );
  }

  return (
    // w-full so that in a `flex-wrap` action row the panel drops onto its own
    // line instead of squeezing the buttons beside it.
    <div className="w-full rounded border border-danger/30 bg-danger/5 p-4 text-left">
      <p className="text-sm font-medium text-danger">{heading}</p>
      <p className="mt-1 text-xs leading-relaxed text-ink-700">{description}</p>

      {confirmWord && (
        <div className="mt-3">
          <label className="mb-1.5 block text-xs text-ink-700">
            Type <span className="font-mono font-medium text-ink-900">{confirmWord}</span> to
            confirm
          </label>
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={confirmWord}
            autoFocus
          />
        </div>
      )}

      {error && (
        <Alert tone="danger" className="mt-3">
          {error}
        </Alert>
      )}

      <div className="mt-3 flex items-center gap-2">
        <Button variant="danger" size="sm" disabled={!armed || loading} onClick={run}>
          {loading ? "Deleting…" : "Delete permanently"}
        </Button>
        <Button variant="secondary" size="sm" disabled={loading} onClick={cancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
