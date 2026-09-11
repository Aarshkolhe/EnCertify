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
    <div className="flex min-h-screen bg-paper">
      <AdminNav adminName={admin.name} />
      <main className="flex-1 px-8 py-8">{children}</main>
    </div>
  );
}
