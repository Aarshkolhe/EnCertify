import { redirect } from "next/navigation";
import { getSessionAdmin } from "@/lib/auth";
import { Card } from "@/components/ui/Card";
import { AccessRequestsManager } from "@/components/admin/AccessRequestsManager";

export const metadata = {
  title: "Admins & Access Requests | EnCertify Admin"
};

export default async function AccessRequestsPage() {
  const admin = await getSessionAdmin();
  if (!admin) {
    redirect("/admin/login");
  }

  if (admin.role !== "SUPER_ADMIN") {
    return (
      <div className="mx-auto max-w-2xl py-12">
        <Card className="border-danger/30 text-center">
          <span className="inline-block rounded-full bg-danger/10 px-3 py-1 font-mono text-xs font-semibold text-danger">
            403 Forbidden
          </span>
          <h1 className="mt-3 font-display text-2xl text-ink-900">Super Admin Access Required</h1>
          <p className="mt-2 text-sm text-ink-500">
            You are signed in as a standard Administrator. Only Super Administrators possess permission to review access requests, modify roles, or manage administrator accounts.
          </p>
        </Card>
      </div>
    );
  }

  return <AccessRequestsManager currentAdminId={admin.id} />;
}
