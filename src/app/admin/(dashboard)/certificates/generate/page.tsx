"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { readError, readJson } from "@/lib/fetchJson";

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
}
interface GenerationSummary {
  batchId: string;
  totalRows: number;
  successCount: number;
  failedCount: number;
  errors: { row: number; reason: string }[];
  downloadUrl: string;
}

type Step = "setup" | "upload" | "mapping" | "result";

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
  const [summary, setSummary] = useState<GenerationSummary | null>(null);

  useEffect(() => {
    async function load() {
      const [eventsRes, templatesRes] = await Promise.all([
        fetch("/api/admin/events"),
        fetch("/api/admin/templates")
      ]);
      const eventsData = await eventsRes.json();
      const templatesData = await templatesRes.json();
      setEvents(eventsData.events || []);
      setTemplates(templatesData.templates || []);
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

  async function handleGenerate() {
    if (!parseResult || !nameColumn) {
      setError("Map the Participant Name column before generating.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/certificates/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uploadId: parseResult.uploadId,
          eventId,
          templateId,
          issueDate,
          mapping: { participantName: nameColumn, participantEmail: emailColumn || undefined }
        })
      });
      if (!res.ok) throw new Error(await readError(res, "Generation failed."));
      const data = await readJson<{ summary?: GenerationSummary }>(res);
      if (!data?.summary) throw new Error("Generation finished but returned no summary.");
      setSummary(data.summary);
      setStep("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function startOver() {
    setStep("setup");
    setFile(null);
    setParseResult(null);
    setSummary(null);
    setError(null);
  }

  const nameColIndex = parseResult?.headers.indexOf(nameColumn) ?? -1;
  const emailColIndex = parseResult && emailColumn ? parseResult.headers.indexOf(emailColumn) : -1;

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-2xl text-ink-900">Generate certificates</h1>

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
              {events.length === 0 && (
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
              {templates.length === 0 && (
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
            <p className="text-sm font-medium text-ink-900">Map Excel columns</p>
            <p className="mt-1 text-sm text-ink-400">{parseResult.totalRows} rows found.</p>
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
                Showing first {parseResult.previewRows.length} of {parseResult.totalRows} rows. Full
                validation (missing names, duplicates) runs when you generate.
              </p>
            </div>
          </Card>

          {error && <Alert tone="danger">{error}</Alert>}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setStep("upload")}>
              ← Back
            </Button>
            <Button onClick={handleGenerate} disabled={loading || !nameColumn}>
              {loading ? "Generating…" : `Generate ${parseResult.totalRows} certificates`}
            </Button>
          </div>
        </div>
      )}

      {step === "result" && summary && (
        <div className="mt-6 space-y-4">
          <Alert tone={summary.successCount > 0 ? "success" : "danger"}>
            ✓ {summary.successCount} certificate{summary.successCount === 1 ? "" : "s"} generated
            {summary.failedCount > 0 ? `, ${summary.failedCount} row(s) skipped` : ""}.
          </Alert>

          {summary.downloadUrl && (
            <a href={summary.downloadUrl}>
              <Button>Download ZIP</Button>
            </a>
          )}

          {summary.errors.length > 0 && (
            <Card>
              <p className="text-sm font-medium text-ink-900">Skipped rows</p>
              <ul className="mt-2 space-y-1 text-sm text-ink-400">
                {summary.errors.slice(0, 30).map((e, i) => (
                  <li key={i}>
                    Row {e.row}: {e.reason}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Button variant="ghost" onClick={startOver}>
            Generate another batch
          </Button>
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
