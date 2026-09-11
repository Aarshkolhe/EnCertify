import Link from "next/link";
import { Button } from "@/components/ui/Button";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col">
      <div className="mx-auto flex max-w-3xl flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        <span className="mb-4 text-sm font-medium text-seal-dark">Certify</span>
        <h1 className="font-display text-4xl leading-tight text-ink-900 sm:text-5xl">
          Find and verify your event certificate
        </h1>
        <p className="mt-4 max-w-lg text-ink-400">
          Search by the name you registered with to view, download, or verify
          a certificate issued for any event.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/certificates">
            <Button size="md">Find my certificate</Button>
          </Link>
          <Link href="/admin/login">
            <Button variant="secondary" size="md">
              Admin sign in
            </Button>
          </Link>
        </div>
      </div>
      <footer className="border-t border-border py-6 text-center text-xs text-ink-400">
        Certificates are verified against a database record, not just a
        correctly formatted ID.
      </footer>
    </main>
  );
}
