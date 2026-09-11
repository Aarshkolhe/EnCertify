"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { readError, readJson } from "@/lib/fetchJson";

interface EventResult {
  id: string;
  name: string;
  date: string;
  count: number;
}

interface CertificateResult {
  certificateId: string;
  participantName: string;
  issueDate: string;
  event: { name: string };
}

type Step = "search" | "events" | "certificates";

export default function StudentCertificatesPage() {
  const [step, setStep] = useState<Step>("search");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<EventResult[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<EventResult | null>(null);
  const [certificates, setCertificates] = useState<CertificateResult[]>([]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) {
      setError("Enter at least 2 characters of your name.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/certificates/search?name=${encodeURIComponent(name.trim())}`);
      if (!res.ok) throw new Error(await readError(res, "Search failed."));
      const data = await readJson<{ events: EventResult[] }>(res);
      if (!data?.events) throw new Error("Search failed. Please try again.");
      if (data.events.length === 0) {
        setError("No certificates found for that name. Check the spelling and try again.");
        setEvents([]);
        return;
      }
      setEvents(data.events);
      setStep("events");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectEvent(event: EventResult) {
    setLoading(true);
    setError(null);
    setSelectedEvent(event);
    try {
      const res = await fetch(
        `/api/certificates/by-event?name=${encodeURIComponent(name.trim())}&eventId=${event.id}`
      );
      if (!res.ok) throw new Error(await readError(res, "Could not load certificates."));
      const data = await readJson<{ certificates: CertificateResult[] }>(res);
      if (!data?.certificates) throw new Error("Could not load certificates. Please try again.");
      setCertificates(data.certificates);
      setStep("certificates");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setStep("search");
    setEvents([]);
    setCertificates([]);
    setSelectedEvent(null);
    setError(null);
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-16">
      <Link href="/" className="text-sm text-ink-400 hover:text-ink-900">
        ← Back
      </Link>
      <h1 className="mt-4 font-display text-3xl text-ink-900">Find your certificate</h1>

      {step === "search" && (
        <Card className="mt-8">
          <form onSubmit={handleSearch} className="space-y-4">
            <div>
              <Label htmlFor="name">Enter your name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Rahul Sharma"
                autoFocus
              />
            </div>
            {error && <Alert tone="danger">{error}</Alert>}
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Searching…" : "Search certificates"}
            </Button>
          </form>
        </Card>
      )}

      {step === "events" && (
        <div className="mt-8 space-y-4">
          <p className="text-sm text-ink-400">
            Certificates found for <span className="font-medium text-ink-900">{name}</span>.
            Select an event:
          </p>
          <div className="space-y-3">
            {events.map((event) => (
              <Card
                key={event.id}
                className="cursor-pointer transition-colors hover:border-seal"
                onClick={() => handleSelectEvent(event)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-ink-900">{event.name}</p>
                    <p className="text-sm text-ink-400">
                      {new Date(event.date).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "long",
                        year: "numeric"
                      })}
                    </p>
                  </div>
                  <span className="text-sm text-seal-dark">
                    {event.count > 1 ? `${event.count} certificates` : "Certificate available"}
                  </span>
                </div>
              </Card>
            ))}
          </div>
          {error && <Alert tone="danger">{error}</Alert>}
          <Button variant="ghost" onClick={reset}>
            ← Search a different name
          </Button>
        </div>
      )}

      {step === "certificates" && selectedEvent && (
        <div className="mt-8 space-y-4">
          <p className="text-sm text-ink-400">
            Your certificates — <span className="font-medium text-ink-900">{selectedEvent.name}</span>
          </p>
          <div className="space-y-4">
            {certificates.map((cert) => (
              <Card key={cert.certificateId}>
                <p className="font-display text-lg text-ink-900">{cert.participantName}</p>
                <p className="mt-1 text-sm text-ink-400">Certificate ID: {cert.certificateId}</p>
                <p className="text-sm text-ink-400">
                  Issued{" "}
                  {new Date(cert.issueDate).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "long",
                    year: "numeric"
                  })}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <a href={`/api/certificate/file/${cert.certificateId}`} target="_blank" rel="noreferrer">
                    <Button variant="secondary" size="sm">
                      View certificate
                    </Button>
                  </a>
                  <a href={`/api/certificate/file/${cert.certificateId}?download=1`}>
                    <Button variant="secondary" size="sm">
                      Download
                    </Button>
                  </a>
                  <Link href={`/certificate/verify/${cert.certificateId}`}>
                    <Button variant="secondary" size="sm">
                      Verify
                    </Button>
                  </Link>
                </div>
              </Card>
            ))}
          </div>
          <Button variant="ghost" onClick={() => setStep("events")}>
            ← Choose a different event
          </Button>
        </div>
      )}
    </main>
  );
}
