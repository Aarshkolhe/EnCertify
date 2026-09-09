"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";

const LINKS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/events", label: "Events" },
  { href: "/admin/templates", label: "Templates" },
  { href: "/admin/certificates/generate", label: "Generate certificates" },
  { href: "/admin/certificates/generated", label: "Generated batches" }
];

export function AdminNav({ adminName }: { adminName: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <aside className="flex w-60 flex-col border-r border-border bg-white px-5 py-8">
      <span className="text-sm font-medium text-seal-dark">Certify Admin</span>
      <nav className="mt-8 flex flex-1 flex-col gap-1">
        {LINKS.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={clsx(
                "rounded px-3 py-2 text-sm transition-colors",
                active ? "bg-ink-900 text-paper" : "text-ink-700 hover:bg-ink-50"
              )}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border pt-4">
        <p className="mb-2 truncate text-xs text-ink-400">{adminName}</p>
        <Button variant="ghost" size="sm" onClick={handleLogout} className="w-full justify-start">
          Sign out
        </Button>
      </div>
    </aside>
  );
}
