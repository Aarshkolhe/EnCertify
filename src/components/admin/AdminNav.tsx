"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { useState, useEffect, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { LogoTile } from "@/components/Logo";

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px] shrink-0"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const ICONS = {
  dashboard: (
    <Icon>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </Icon>
  ),
  events: (
    <Icon>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </Icon>
  ),
  templates: (
    <Icon>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 21V9" />
    </Icon>
  ),
  generate: (
    <Icon>
      <path d="M12 3v13m0 0 4.5-4.5M12 16l-4.5-4.5" />
      <path d="M4 20h16" />
    </Icon>
  ),
  batches: (
    <Icon>
      <rect x="3" y="4" width="18" height="5" rx="1" />
      <path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4" />
    </Icon>
  ),
  issued: (
    <Icon>
      <path d="M5 4h11l4 4v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
      <path d="M15 4v5h5M8.5 14.5l2 2 4-4.5" />
    </Icon>
  ),
  users: (
    <Icon>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </Icon>
  ),
  account: (
    <Icon>
      <circle cx="12" cy="8" r="4" />
      <path d="M6 21v-2a6 6 0 0 1 12 0v2" />
    </Icon>
  )
};

export function AdminNav({
  adminName,
  adminRole
}: {
  adminName: string;
  adminRole?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const isSuperAdmin = adminRole === "SUPER_ADMIN";

  useEffect(() => {
    if (!isSuperAdmin) return;

    let active = true;
    async function fetchPendingCount() {
      try {
        const res = await fetch("/api/admin/access-requests/count");
        if (res.ok && active) {
          const data = await res.json();
          setPendingCount(data.pendingCount || 0);
        }
      } catch {
        // Silently ignore badge fetch errors
      }
    }

    fetchPendingCount();
    // Poll every 30 seconds for pending count
    const interval = setInterval(fetchPendingCount, 30000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [isSuperAdmin]);

  async function handleLogout() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setSigningOut(false);
      setConfirmSignOut(false);
      router.push("/admin/login");
      router.refresh();
    }
  }

  const initial = adminName.trim().charAt(0).toUpperCase() || "A";

  const groups: Array<{
    label: string | null;
    links: Array<{ href: string; label: string; icon: ReactNode; badge?: number }>;
  }> = [
    {
      label: null,
      links: [{ href: "/admin", label: "Dashboard", icon: ICONS.dashboard }]
    },
    {
      label: "Set up",
      links: [
        { href: "/admin/events", label: "Events", icon: ICONS.events },
        { href: "/admin/templates", label: "Templates", icon: ICONS.templates }
      ]
    },
    {
      label: "Certificates",
      links: [
        { href: "/admin/certificates/generate", label: "Generate", icon: ICONS.generate },
        { href: "/admin/certificates/generated", label: "Batches", icon: ICONS.batches },
        { href: "/admin/certificates/issued", label: "Issued", icon: ICONS.issued }
      ]
    }
  ];

  if (isSuperAdmin) {
    groups.push({
      label: "Management",
      links: [
        {
          href: "/admin/access-requests",
          label: "Admins & Requests",
          icon: ICONS.users,
          badge: pendingCount
        }
      ]
    });
  }

  groups.push({
    label: "Account",
    links: [
      { href: "/admin/account", label: "My Account", icon: ICONS.account }
    ]
  });

  return (
    <aside className="admin-rail sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-border px-4 py-6">
      <Link href="/admin" className="flex items-center gap-2.5 px-2">
        <LogoTile className="h-9 w-9" />
        <span className="leading-tight">
          <span className="block font-display text-base text-ink-900">EnCertify</span>
          <span className="block text-[10px] uppercase tracking-[0.18em] text-ink-400">
            {isSuperAdmin ? "Super Admin" : "Admin"}
          </span>
        </span>
      </Link>

      <nav className="mt-8 flex flex-1 flex-col gap-6 overflow-y-auto">
        {groups.map((group, i) => (
          <div key={group.label ?? `group-${i}`}>
            {group.label && (
              <p className="mb-1.5 px-3 text-[10px] font-medium uppercase tracking-[0.16em] text-ink-400">
                {group.label}
              </p>
            )}
            <div className="flex flex-col gap-0.5">
              {group.links.map((link) => {
                // `/admin` would otherwise match every nested route.
                const active =
                  link.href === "/admin"
                    ? pathname === "/admin"
                    : pathname === link.href || pathname.startsWith(link.href + "/");
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={clsx(
                      "flex items-center justify-between rounded px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-ink-900 text-paper"
                        : "text-ink-700 hover:bg-ink-900/[0.06] hover:text-ink-900"
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={active ? "text-paper" : "text-ink-400"}>{link.icon}</span>
                      <span>{link.label}</span>
                    </div>
                    {typeof link.badge === "number" && link.badge > 0 && (
                      <span
                        className={clsx(
                          "ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                          active
                            ? "bg-paper text-ink-900"
                            : "bg-seal/10 text-seal-dark"
                        )}
                      >
                        {link.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-6 rounded-lg border border-border bg-white/70 p-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink-900 text-xs font-medium text-paper">
            {initial}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-xs font-medium text-ink-900">{adminName}</span>
            <span className="block text-[10px] text-ink-400">
              {isSuperAdmin ? "Super Admin" : "Signed in"}
            </span>
          </span>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setConfirmSignOut(true)}
          className="mt-3 w-full justify-center"
        >
          Sign out
        </Button>
      </div>

      {confirmSignOut && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-border bg-white p-5 shadow-2xl">
            <h3 className="font-display text-base font-semibold text-ink-900">Sign Out</h3>
            <p className="mt-2 text-xs text-ink-500">
              Are you sure you want to sign out of your administrator account?
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setConfirmSignOut(false)}
                disabled={signingOut}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleLogout}
                disabled={signingOut}
              >
                {signingOut ? "Signing out…" : "Sign out"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
