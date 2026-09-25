"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { readError } from "@/lib/fetchJson";
import { LogoFull } from "@/components/Logo";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      if (!res.ok) throw new Error(await readError(res, "Login failed."));
      router.push("/admin");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-ink-900 px-6 py-12">
      <div aria-hidden="true" className="auth-wash absolute inset-0" />

      {/*
        The logo is a near-black plate, which reads as a dull patch straight
        on the navy ground — so it is set in a lit frame instead: a gold bloom
        behind it, a thin gradient edge, and a slow sheen passing over it.
        The artwork itself is untouched.
      */}
      <div className="rise relative mb-9">
        <div className="overflow-hidden rounded-2xl shadow-[0_30px_60px_-24px_rgba(0,0,0,0.8)] ring-1 ring-white/10">
          <LogoFull className="w-56" />
        </div>
      </div>

      <Card className="rise relative w-full max-w-sm [animation-delay:130ms]">
        <span className="block text-sm font-medium text-seal-dark">EnCertify</span>
        <h1 className="mt-1 font-display text-2xl text-ink-900">Admin sign in</h1>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <Alert tone="danger">{error}</Alert>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Signing in…" : "Sign in"}
          </Button>

          <div className="pt-2 text-center text-xs text-ink-500">
            Need admin access?{" "}
            <Link href="/admin/request-access" className="font-medium text-seal hover:underline">
              Request an account
            </Link>
          </div>
        </form>
      </Card>
    </main>
  );
}
