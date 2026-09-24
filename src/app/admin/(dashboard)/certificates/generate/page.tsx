"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { readError, readJson } from "@/lib/fetchJson";
import { MAX_CERTIFICATES_PER_BATCH } from "@/lib/constants";
import {
  buildParticipants,
  splitIntoChunks,
  type ParticipantRecord
} from "@/lib/participantValidator";

interface EventOption {
  id: string;
  name: string;
}
interface TemplateOption {
  id: string;
  name: string;
}
interface ParseResult {
  uploadId: string;
  headers: string[];
  totalRows: number;
  previewRows: string[][];
  rows?: string[][];
}
interface GenerationSummary {
  batchId: string;
  totalRows: number;
  successCount: number;
  failedCount: number;
  errors: { row: number; reason: string }[];
  downloadUrl: string;
}

interface BatchProgressItem {
  batchIndex: number;
  batchNumber: number;
  participantCount: number;
  status: "pending" | "running" | "completed" | "failed";
  summary?: GenerationSummary;
  error?: string;
}

type Step = "setup" | "upload" | "mapping" | "generating" | "result";

export default function GenerateCertificatesPage() {
  const [step, setStep] = useState<Step>("setup");
  const [events, setEvents] = useState<EventOption[]>([]);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [eventId, setEventId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [file, setFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [nameColumn, setNameColumn] = useState("");
  const [emailColumn, setEmailColumn] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [listsLoaded, setListsLoaded] = useState(false);

  // Multi-batch sequential execution states
  const [batches, setBatches] = useState<BatchProgressItem[]>([]);
  const [currentBatchIndex, setCurrentBatchIndex] = useState<number>(-1);

  useEffect(() => {
    async function load() {
      try {
        const [eventsRes, templatesRes] = await Promise.all([
          fetch("/api/admin/events"),
          fetch("/api/admin/templates")
        ]);

        if (!eventsRes.ok) {
          throw new Error(await readError(eventsRes, "Could not load events."));
        }
        if (!templatesRes.ok) {
          throw new Error(await readError(templatesRes, "Could not load templates."));
        }

        const eventsData = await readJson<{ events?: EventOption[] }>(eventsRes);
        const templatesData = await readJson<{ templates?: TemplateOption[] }>(templatesRes);
        setEvents(eventsData?.events ?? []);
        setTemplates(templatesData?.templates ?? []);
      } catch (err) {
        setLoadError(
          err instanceof Error ? err.message : "Could not load events and templates."
        );
      } finally {
        setListsLoaded(true);
      }
    }
    load();
  }, []);

  function goToUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!eventId || !templateId || !issueDate) {
      setError("Select an event, a template, and an issue date.");
      return;
    }
    setError(null);
    setStep("upload");
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Choose an Excel file (.xlsx or .xls).");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/certificates/parse-excel", { method: "POST", body: formData });
      if (!res.ok) throw new Error(await readError(res, "Could not read the file."));
      const data = await readJson<ParseResult>(res);
      if (!data?.headers) throw new Error("The server did not return a readable sheet.");
      setParseResult(data);
      setNameColumn(guessColumn(data.headers, ["name", "participant name", "full name"]));
      setEmailColumn(guessColumn(data.headers, ["email", "email address"]));
      setStep("mapping");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  // Pure client-side validation on parsed rows
  const validationResult = useMemo(() => {
    if (!parseResult?.rows || !nameColumn) return null;
    try {
      return buildParticipants(parseResult.headers, parseResult.rows, {
        participantName: nameColumn,
        participantEmail: emailColumn || undefined
      });
    } catch {
      return null;
    }
  }, [parseResult, nameColumn, emailColumn]);

  const validParticipants = useMemo(() => validationResult?.valid ?? [], [validationResult]);
  const validationErrors = useMemo(() => validationResult?.errors ?? [], [validationResult]);

  // Divide valid participants into sequential chunks of <= MAX_CERTIFICATES_PER_BATCH (20)
  const chunks: ParticipantRecord[][] = useMemo(() => {
    if (validParticipants.length === 0) return [];
    return splitIntoChunks(validParticipants, MAX_CERTIFICATES_PER_BATCH);
  }, [validParticipants]);

  const splitBreakdown = useMemo(() => {
    if (chunks.length === 0) return "0";
    return chunks.map((c) => c.length).join(" + ");
  }, [chunks]);

  // Sequential generation execution engine
  async function runBatchSequence(
    initialBatches: BatchProgressItem[],
    startIndex: number
  ) {
    setLoading(true);
    setError(null);
    setStep("generating");

    let activeBatches = [...initialBatches];

    for (let i = startIndex; i < chunks.length; i++) {
      const chunk = chunks[i];
      setCurrentBatchIndex(i);

      // Set current batch to running
      activeBatches = activeBatches.map((b, idx) =>
        idx === i ? { ...b, status: "running" as const, error: undefined } : b
      );
      setBatches(activeBatches);

      try {
        const res = await fetch("/api/admin/certificates/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventId,
            templateId,
            issueDate,
            participants: chunk
          })
        });

        if (!res.ok) {
          const errText = await readError(res, `Batch ${i + 1} failed.`);
          throw new Error(errText);
        }

        const data = await readJson<{ summary?: GenerationSummary }>(res);
        if (!data?.summary) {
          throw new Error(`Batch ${i + 1} completed but returned no summary.`);
        }

        // Set current batch to completed
        activeBatches = activeBatches.map((b, idx) =>
          idx === i ? { ...b, status: "completed" as const, summary: data.summary } : b
        );
        setBatches(activeBatches);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : `Batch ${i + 1} failed.`;
        // Mark failed batch
        activeBatches = activeBatches.map((b, idx) =>
          idx === i ? { ...b, status: "failed" as const, error: errMsg } : b
        );
        setBatches(activeBatches);

        // STOP sequential execution immediately
        setError(`Batch ${i + 1} of ${chunks.length} failed. The remaining batches were not started.`);
        setLoading(false);
        return;
      }
    }

    // All chunks succeeded! Clean up temporary uploaded file from storage
    if (parseResult?.uploadId) {
      fetch(`/api/admin/certificates/parse-excel?uploadId=${encodeURIComponent(parseResult.uploadId)}`, {
        method: "DELETE"
      }).catch(() => {});
    }

    setLoading(false);
    setStep("result");
  }

  function handleStartGeneration() {
    if (!parseResult || !nameColumn) {
      setError("Map the Participant Name column before generating.");
      return;
    }
    if (validParticipants.length === 0) {
      setError("No valid participants found. Please verify column mapping.");
      return;
    }

    const initialList: BatchProgressItem[] = chunks.map((chunk, idx) => ({
      batchIndex: idx,
      batchNumber: idx + 1,
      participantCount: chunk.length,
      status: "pending"
    }));

    setBatches(initialList);
    runBatchSequence(initialList, 0);
  }

  function handleRetryFailedBatch() {
    const failedIndex = batches.findIndex((b) => b.status === "failed");
    if (failedIndex === -1) return;
    runBatchSequence(batches, failedIndex);
  }

  function startOver() {
    if (parseResult?.uploadId) {
      fetch(`/api/admin/certificates/parse-excel?uploadId=${encodeURIComponent(parseResult.uploadId)}`, {
        method: "DELETE"
      }).catch(() => {});
    }
    setStep("setup");
    setFile(null);
    setParseResult(null);
    setBatches([]);
    setCurrentBatchIndex(-1);
    setError(null);
  }

  const nameColIndex = parseResult?.headers.indexOf(nameColumn) ?? -1;
  const emailColIndex = parseResult && emailColumn ? parseResult.headers.indexOf(emailColumn) : -1;

  // Calculation for progress & summary
  const completedCount = batches
    .filter((b) => b.status === "completed")
    .reduce((sum, b) => sum + (b.summary?.successCount ?? b.participantCount), 0);
  const totalCount = validParticipants.length;
  const overallPercent = totalCount > 0 ? Math.min(100, Math.round((completedCount / totalCount) * 100)) : 0;
  const failedBatch = batches.find((b) => b.status === "failed");

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-2xl text-ink-900">Generate certificates</h1>

      {loadError && (
        <Alert tone="danger" className="mt-4">
          {loadError}
        </Alert>
      )}

      {step === "setup" && (
        <Card className="mt-6">
          <form onSubmit={goToUpload} className="space-y-4">
            <div>
              <Label htmlFor="event">Event</Label>
              <select
                id="event"
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
                className="w-full rounded border border-border bg-white px-3 py-2 text-sm"
                required
              >
                <option value="">Select an event…</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name}
                  </option>
                ))}
              </select>
              {listsLoaded && !loadError && events.length === 0 && (
                <p className="mt-1 text-xs text-ink-400">No events yet — create one first.</p>
              )}
            </div>
            <div>
              <Label htmlFor="template">Certificate template</Label>
              <select
                id="template"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className="w-full rounded border border-border bg-white px-3 py-2 text-sm"
                required
              >
                <option value="">Select a template…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              {listsLoaded && !loadError && templates.length === 0 && (
                <p className="mt-1 text-xs text-ink-400">No templates yet — create one first.</p>
              )}
            </div>
            <div>
              <Label htmlFor="issueDate">Certificate issue date</Label>
              <Input
                id="issueDate"
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                required
              />
            </div>
            {error && <Alert tone="danger">{error}</Alert>}
            <Button type="submit">Continue</Button>
          </form>
        </Card>
      )}

      {step === "upload" && (
        <Card className="mt-6">
          <form onSubmit={handleUpload} className="space-y-4">
            <div>
              <Label htmlFor="excel">Participant Excel file (.xlsx or .xls)</Label>
              <input
                id="excel"
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="block w-full text-sm text-ink-700"
                required
              />
              <p className="mt-1 text-xs text-ink-400">
                Files with &gt; {MAX_CERTIFICATES_PER_BATCH} participants are automatically split into sequential batches of {MAX_CERTIFICATES_PER_BATCH}.
              </p>
            </div>
            {error && <Alert tone="danger">{error}</Alert>}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setStep("setup")}>
                ← Back
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Reading file…" : "Upload & continue"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {step === "mapping" && parseResult && (
        <div className="mt-6 space-y-6">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-ink-900">Map Excel columns</p>
                <p className="mt-1 text-sm text-ink-400">
                  {parseResult.totalRows} {parseResult.totalRows === 1 ? "row" : "rows"} found in sheet.
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-ink-600">
                Safe batch limit: max {MAX_CERTIFICATES_PER_BATCH} / batch
              </span>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>Participant Name column (required)</Label>
                <select
                  value={nameColumn}
                  onChange={(e) => setNameColumn(e.target.value)}
                  className="w-full rounded border border-border bg-white px-3 py-2 text-sm"
                >
                  <option value="">Select…</option>
                  {parseResult.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Participant Email column (optional)</Label>
                <select
                  value={emailColumn}
                  onChange={(e) => setEmailColumn(e.target.value)}
                  className="w-full rounded border border-border bg-white px-3 py-2 text-sm"
                >
                  <option value="">None</option>
                  {parseResult.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </Card>

          <Card>
            <p className="text-sm font-medium text-ink-900">Preview</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-ink-400">
                    <th className="py-1.5 pr-4">Name</th>
                    <th className="py-1.5 pr-4">Email</th>
                  </tr>
                </thead>
                <tbody>
                  {parseResult.previewRows.map((row, i) => (
                    <tr key={i} className="border-b border-border/60">
                      <td className="py-1.5 pr-4">{nameColIndex >= 0 ? row[nameColIndex] : "—"}</td>
                      <td className="py-1.5 pr-4">{emailColIndex >= 0 ? row[emailColIndex] : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-ink-400">
                Showing first {parseResult.previewRows.length} of {parseResult.totalRows} rows.
              </p>
            </div>
          </Card>

          {/* Validation Notice & Split Information */}
          {nameColumn && validParticipants.length > 0 && (
            <div className="space-y-3">
              {validationErrors.length > 0 && (
                <Alert tone="neutral">
                  <p className="font-medium text-xs">
                    {validationErrors.length} row(s) skipped due to missing name or duplicate entries.
                  </p>
                </Alert>
              )}

              {chunks.length > 1 ? (
                <Alert tone="neutral">
                  <p className="font-medium">
                    {validParticipants.length} participants will be generated in {chunks.length} batches: {splitBreakdown}
                  </p>
                  <p className="mt-1 text-xs text-ink-500">
                    EnCertify will automatically run each batch of &le; {MAX_CERTIFICATES_PER_BATCH} participants sequentially to keep ZIP archives safely within Supabase storage limits. No manual splitting required.
                  </p>
                </Alert>
              ) : (
                <Alert tone="neutral">
                  <p className="font-medium">
                    {validParticipants.length} participant{validParticipants.length === 1 ? "" : "s"} will be generated in 1 batch.
                  </p>
                </Alert>
              )}
            </div>
          )}

          {error && <Alert tone="danger">{error}</Alert>}

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setStep("upload")}>
                ← Back
              </Button>
              <Button
                onClick={handleStartGeneration}
                disabled={loading || !nameColumn || validParticipants.length === 0}
              >
                {loading
                  ? "Starting…"
                  : chunks.length > 1
                    ? `Generate ${chunks.length} Batches (${validParticipants.length} Certificates)`
                    : `Generate ${validParticipants.length} Certificate${validParticipants.length === 1 ? "" : "s"}`}
              </Button>
            </div>
            <span className="text-xs text-ink-400">
              Automatic sequential batches · Max {MAX_CERTIFICATES_PER_BATCH} per batch
            </span>
          </div>
        </div>
      )}

      {/* Generating Progress View */}
      {step === "generating" && (
        <div className="mt-6 space-y-6">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-4">
              <div>
                <p className="font-medium text-ink-900">Certificate generation in progress</p>
                <p className="mt-1 text-sm text-ink-500">
                  {totalCount} participants will be generated in {batches.length} batches: {splitBreakdown}
                </p>
              </div>
              <Badge tone={failedBatch ? "danger" : "neutral"}>
                {failedBatch ? "Paused on Error" : `Batch ${currentBatchIndex + 1} of ${batches.length}`}
              </Badge>
            </div>

            {/* Overall Progress Bar */}
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-xs text-ink-600 font-medium">
                <span>Overall: {completedCount}/{totalCount} certificates generated</span>
                <span>{overallPercent}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full transition-all duration-300 ${failedBatch ? "bg-amber-500" : "bg-primary-600"}`}
                  style={{ width: `${overallPercent}%` }}
                />
              </div>
            </div>

            {/* Sequential Batches Progress List */}
            <div className="mt-6 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
                Batch execution queue
              </p>
              <div className="divide-y divide-border/60 rounded border border-border bg-slate-50/50">
                {batches.map((b) => (
                  <div key={b.batchNumber} className="flex items-center justify-between px-4 py-3 text-sm">
                    <div>
                      <p className="font-medium text-ink-900">
                        Batch {b.batchNumber} of {batches.length}
                      </p>
                      <p className="text-xs text-ink-400">
                        {b.status === "completed"
                          ? `${b.summary?.successCount ?? b.participantCount}/${b.participantCount} completed`
                          : b.status === "running"
                            ? `Generating ${b.participantCount} certificates…`
                            : b.status === "failed"
                              ? `Failed at this batch`
                              : `Queued (${b.participantCount} certificates)`}
                      </p>
                    </div>
                    <div>
                      {b.status === "completed" && <Badge tone="success">✓ Completed</Badge>}
                      {b.status === "running" && <Badge tone="neutral">Generating…</Badge>}
                      {b.status === "failed" && <Badge tone="danger">✕ Failed</Badge>}
                      {b.status === "pending" && (
                        <span className="text-xs text-ink-400">Waiting</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Failure Alert & Retry Handler */}
          {failedBatch && (
            <div className="space-y-4">
              <Alert tone="danger">
                <p className="font-medium">
                  Batch {failedBatch.batchNumber} of {batches.length} failed. The remaining batches were not started.
                </p>
                {failedBatch.error && (
                  <p className="mt-1 text-xs text-red-700 font-mono">{failedBatch.error}</p>
                )}
                <p className="mt-2 text-xs">
                  Already completed batches were safely preserved. You can retry Batch {failedBatch.batchNumber} safely without re-generating completed certificates.
                </p>
              </Alert>

              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={handleRetryFailedBatch} disabled={loading}>
                  {loading ? "Retrying…" : `Retry failed batch (Batch ${failedBatch.batchNumber})`}
                </Button>
                <Link href="/admin/certificates/generated">
                  <Button variant="secondary">View completed batches</Button>
                </Link>
                <Button variant="ghost" onClick={startOver}>
                  Cancel & Start over
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Final Multi-Batch Summary */}
      {step === "result" && (
        <div className="mt-6 space-y-6">
          <Alert tone="success">
            <p className="font-medium">
              ✓ All {completedCount} certificate{completedCount === 1 ? "" : "s"} generated successfully across {batches.length} batch{batches.length === 1 ? "" : "es"}.
            </p>
          </Alert>

          <Card>
            <p className="font-medium text-ink-900">Generation overview</p>
            <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded border border-border p-3">
                <p className="text-xs text-ink-400">Total participants</p>
                <p className="mt-1 text-xl font-bold text-ink-900">{totalCount}</p>
              </div>
              <div className="rounded border border-border p-3">
                <p className="text-xs text-ink-400">Batches created</p>
                <p className="mt-1 text-xl font-bold text-ink-900">{batches.length}</p>
              </div>
              <div className="rounded border border-border p-3">
                <p className="text-xs text-ink-400">Certificates issued</p>
                <p className="mt-1 text-xl font-bold text-emerald-600">{completedCount}</p>
              </div>
              <div className="rounded border border-border p-3">
                <p className="text-xs text-ink-400">Skipped rows</p>
                <p className="mt-1 text-xl font-bold text-ink-900">{validationErrors.length}</p>
              </div>
            </div>

            {/* Individual Batch Results */}
            <div className="mt-6 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
                Generated batches ({batches.length})
              </p>
              <div className="divide-y divide-border rounded border border-border">
                {batches.map((b) => (
                  <div
                    key={b.batchNumber}
                    className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm"
                  >
                    <div>
                      <p className="font-medium text-ink-900">
                        Batch {b.batchNumber} → {b.summary?.successCount ?? b.participantCount}/{b.participantCount} completed
                      </p>
                      <p className="text-xs text-ink-400">
                        Batch ID: <span className="font-mono">{b.summary?.batchId}</span>
                      </p>
                    </div>
                    {b.summary?.downloadUrl && (
                      <a href={b.summary.downloadUrl}>
                        <Button size="sm" variant="secondary">
                          Download ZIP
                        </Button>
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {validationErrors.length > 0 && (
            <Card>
              <p className="text-sm font-medium text-ink-900">Skipped rows in Excel</p>
              <ul className="mt-2 space-y-1 text-sm text-ink-400">
                {validationErrors.slice(0, 30).map((e, i) => (
                  <li key={i}>
                    Row {e.row}: {e.reason}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Link href="/admin/certificates/generated">
              <Button variant="secondary">View all generated batches</Button>
            </Link>
            <Button variant="ghost" onClick={startOver}>
              Generate another batch
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function guessColumn(headers: string[], candidates: string[]): string {
  const lower = headers.map((h) => h.toLowerCase());
  for (const candidate of candidates) {
    const idx = lower.indexOf(candidate);
    if (idx >= 0) return headers[idx];
  }
  return "";
}
