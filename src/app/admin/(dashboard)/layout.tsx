import { redirect } from "next/navigation";
import { getSessionAdmin } from "@/lib/auth";
import { AdminNav } from "@/components/admin/AdminNav";

export default async function AdminDashboardLayout({
  children
}: {
  children: React.ReactNode;
}) {
  // Middleware already gates /admin/* on a syntactically valid JWT at the
  // edge, but that never touches the database. This is the real check:
  // it re-loads the admin record so a revoked/deleted account loses
  // access immediately, and every admin API route repeats this same
  // check independently.
  const admin = await getSessionAdmin();
  if (!admin) redirect("/admin/login");

  return (
    <div className="admin-bg flex min-h-screen">
      <AdminNav adminName={admin.name} adminRole={admin.role} />
      <div className="relative flex-1 overflow-hidden">
        <div aria-hidden="true" className="admin-dots pointer-events-none absolute inset-0" />
        <main className="relative mx-auto max-w-6xl px-8 py-10">{children}</main>
      </div>
    </div>
  );
}
