import { redirect } from "next/navigation";
import { getSessionAdmin } from "@/lib/auth";
import { AccountSettings } from "@/components/admin/AccountSettings";

export const metadata = {
  title: "My Account | EnCertify Admin"
};

export default async function AccountPage() {
  const admin = await getSessionAdmin();
  if (!admin) {
    redirect("/admin/login");
  }

  return (
    <AccountSettings
      initialAdmin={{
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        status: admin.status
      }}
    />
  );
}
