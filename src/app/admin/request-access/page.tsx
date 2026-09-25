"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { readError } from "@/lib/fetchJson";
import { LogoFull } from "@/components/Logo";

export default function RequestAccessPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState("");
  const [organization, setOrganization] = useState("");
  const [reason, setReason] = useState("");
  const [website, setWebsite] = useState(""); // Honeypot field
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/request-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          email,
          department: department || null,
          organization: organization || null,
          reason,
          website // Honeypot
        })
      });

      if (!res.ok) {
        throw new Error(await readError(res, "Request submission failed."));
      }

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request submission failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-ink-900 px-6 py-12">
      <div aria-hidden="true" className="auth-wash absolute inset-0" />

      <div className="rise relative mb-8">
        <div className="overflow-hidden rounded-2xl shadow-[0_30px_60px_-24px_rgba(0,0,0,0.8)] ring-1 ring-white/10">
          <LogoFull className="w-56" />
        </div>
      </div>

      <Card className="rise relative w-full max-w-md [animation-delay:130ms]">
        <span className="block text-sm font-medium text-seal-dark">EnCertify Access</span>
        <h1 className="mt-1 font-display text-2xl text-ink-900">Request Admin Access</h1>

        {submitted ? (
          <div className="mt-6 space-y-4">
            <Alert tone="success">
              <span className="font-semibold block">Request submitted successfully.</span>
              Your request is awaiting Super Admin approval. Once approved, you will receive an activation link to set your password.
            </Alert>
            <div className="pt-2">
              <Link href="/admin/login">
                <Button variant="secondary" className="w-full">
                  Return to sign in
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <p className="text-xs text-ink-500">
              Submit your details to request an administrator account. All requests are reviewed by an organization Super Admin.
            </p>

            <div>
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Dr. Jane Doe"
                required
              />
            </div>

            <div>
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane.doe@institution.edu"
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="department">Department (optional)</Label>
                <Input
                  id="department"
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="Computer Science"
                />
              </div>
              <div>
                <Label htmlFor="organization">Organization (optional)</Label>
                <Input
                  id="organization"
                  type="text"
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                  placeholder="Tech Summit"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="reason">Reason for access</Label>
              <textarea
                id="reason"
                rows={3}
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain why you require admin permissions to issue or manage certificates..."
                className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-seal focus:outline-none focus:ring-1 focus:ring-seal"
              />
            </div>

            {/* Honeypot field - invisible to humans */}
            <div className="hidden" aria-hidden="true">
              <label htmlFor="website">Website</label>
              <input
                id="website"
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </div>

            {error && <Alert tone="danger">{error}</Alert>}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Submitting request…" : "Submit Access Request"}
            </Button>

            <div className="pt-2 text-center text-xs text-ink-500">
              Already have an account?{" "}
              <Link href="/admin/login" className="font-medium text-seal hover:underline">
                Sign in
              </Link>
            </div>
          </form>
        )}
      </Card>
    </main>
  );
}
