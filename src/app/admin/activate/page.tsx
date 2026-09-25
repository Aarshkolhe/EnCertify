"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { readError } from "@/lib/fetchJson";
import { LogoFull } from "@/components/Logo";

function ActivationForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [checking, setChecking] = useState(true);
  const [applicantInfo, setApplicantInfo] = useState<{ email: string; name: string } | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [activated, setActivated] = useState(false);

  useEffect(() => {
    if (!token) {
      setTokenError("No activation token was provided. Please check the link sent by your administrator.");
      setChecking(false);
      return;
    }

    async function checkToken() {
      try {
        const res = await fetch(`/api/auth/activate?token=${encodeURIComponent(token)}`);
        if (!res.ok) {
          throw new Error(await readError(res, "Activation link is invalid or expired."));
        }
        const data = await res.json();
        setApplicantInfo({ email: data.email, name: data.name });
      } catch (err) {
        setTokenError(err instanceof Error ? err.message : "Activation link is invalid or expired.");
      } finally {
        setChecking(false);
      }
    }

    checkToken();
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setSubmitError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setSubmitError("Password must be at least 8 characters long.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch("/api/auth/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, confirmPassword })
      });

      if (!res.ok) {
        throw new Error(await readError(res, "Activation failed."));
      }

      setActivated(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Activation failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="rise relative w-full max-w-md [animation-delay:130ms]">
      <span className="block text-sm font-medium text-seal-dark">Account Setup</span>
      <h1 className="mt-1 font-display text-2xl text-ink-900">Activate Admin Account</h1>

      {checking ? (
        <div className="py-8 text-center text-sm text-ink-500">
          Verifying activation credentials…
        </div>
      ) : tokenError ? (
        <div className="mt-6 space-y-4">
          <Alert tone="danger">{tokenError}</Alert>
          <div className="pt-2">
            <Link href="/admin/login">
              <Button variant="secondary" className="w-full">
                Go to sign in
              </Button>
            </Link>
          </div>
        </div>
      ) : activated ? (
        <div className="mt-6 space-y-4">
          <Alert tone="success">
            <span className="font-semibold block">Account activated!</span>
            Your password has been saved and your account is now active. You may sign in with your email and new password.
          </Alert>
          <div className="pt-2">
            <Link href="/admin/login">
              <Button className="w-full">
                Proceed to sign in
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {applicantInfo && (
            <div className="rounded-lg border border-border bg-ink-900/[0.03] p-3 text-xs">
              <p className="text-ink-400">Activating account for:</p>
              <p className="mt-0.5 font-medium text-ink-900">{applicantInfo.name}</p>
              <p className="text-ink-600 font-mono text-[11px]">{applicantInfo.email}</p>
            </div>
          )}

          <div>
            <Label htmlFor="password">Create Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              required
              minLength={8}
            />
          </div>

          <div>
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter password"
              required
              minLength={8}
            />
          </div>

          {submitError && <Alert tone="danger">{submitError}</Alert>}

          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Activating account…" : "Activate Account & Set Password"}
          </Button>
        </form>
      )}
    </Card>
  );
}

export default function ActivatePage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-ink-900 px-6 py-12">
      <div aria-hidden="true" className="auth-wash absolute inset-0" />

      <div className="rise relative mb-8">
        <div className="overflow-hidden rounded-2xl shadow-[0_30px_60px_-24px_rgba(0,0,0,0.8)] ring-1 ring-white/10">
          <LogoFull className="w-56" />
        </div>
      </div>

      <Suspense fallback={
        <Card className="rise relative w-full max-w-md">
          <div className="py-8 text-center text-sm text-ink-500">Loading activation...</div>
        </Card>
      }>
        <ActivationForm />
      </Suspense>
    </main>
  );
}
