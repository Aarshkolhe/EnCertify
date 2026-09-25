"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { readError } from "@/lib/fetchJson";

interface AdminProfile {
  id: string;
  name: string;
  email: string;
  role: "SUPER_ADMIN" | "ADMIN";
  status: "INVITED" | "ACTIVE" | "SUSPENDED" | "REMOVED";
}

export function AccountSettings({ initialAdmin }: { initialAdmin: AdminProfile }) {
  const router = useRouter();

  // Profile update state
  const [name, setName] = useState(initialAdmin.name);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Account deletion modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setProfileSuccess(null);
    setProfileError(null);

    try {
      const res = await fetch("/api/admin/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() })
      });

      if (!res.ok) {
        throw new Error(await readError(res, "Could not update profile."));
      }

      setProfileSuccess("Profile updated successfully.");
      router.refresh();
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Could not update profile.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters long.");
      return;
    }

    setSavingPassword(true);
    setPasswordSuccess(null);
    setPasswordError(null);

    try {
      const res = await fetch("/api/admin/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword
        })
      });

      if (!res.ok) {
        throw new Error(await readError(res, "Could not change password."));
      }

      setPasswordSuccess("Password changed successfully. All other active sessions have been invalidated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Could not change password.");
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleDeleteAccount(e: React.FormEvent) {
    e.preventDefault();
    if (deleteConfirmationText !== "DELETE") {
      setDeleteError("You must type 'DELETE' to confirm deletion.");
      return;
    }
    if (!deletePassword) {
      setDeleteError("Password is required.");
      return;
    }

    setDeletingAccount(true);
    setDeleteError(null);

    try {
      const res = await fetch("/api/admin/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: deletePassword,
          confirmationText: deleteConfirmationText
        })
      });

      if (!res.ok) {
        throw new Error(await readError(res, "Could not delete account."));
      }

      // Redirect to login page upon successful deletion
      router.push("/admin/login");
      router.refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete account.");
      setDeletingAccount(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-ink-900">Account Settings</h1>
        <p className="mt-1 text-sm text-ink-500">
          Manage your personal administrator profile, security credentials, and account status.
        </p>
      </div>

      {/* Card 1: Profile Information */}
      <Card>
        <h2 className="font-display text-lg text-ink-900">Profile Information</h2>
        <p className="text-xs text-ink-500 mt-0.5">
          Update your display name. Email address is permanent and cannot be modified.
        </p>

        <form onSubmit={handleProfileSubmit} className="mt-5 space-y-4 max-w-lg">
          <div>
            <Label htmlFor="adminName">Full Name</Label>
            <Input
              id="adminName"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="adminEmail">Email Address</Label>
              <span className="text-[11px] text-ink-400">Email cannot be changed</span>
            </div>
            <Input
              id="adminEmail"
              type="email"
              disabled
              value={initialAdmin.email}
              className="bg-ink-50 text-ink-500 cursor-not-allowed border-dashed"
            />
          </div>

          <div className="flex items-center gap-4 pt-1 text-xs">
            <div>
              <span className="text-ink-400 mr-1.5">Role:</span>
              <Badge tone={initialAdmin.role === "SUPER_ADMIN" ? "seal" : "neutral"}>
                {initialAdmin.role === "SUPER_ADMIN" ? "Super Admin" : "Admin"}
              </Badge>
            </div>
            <div>
              <span className="text-ink-400 mr-1.5">Status:</span>
              <Badge tone={initialAdmin.status === "ACTIVE" ? "success" : "neutral"}>
                {initialAdmin.status}
              </Badge>
            </div>
          </div>

          {profileError && <Alert tone="danger">{profileError}</Alert>}
          {profileSuccess && <Alert tone="success">{profileSuccess}</Alert>}

          <Button type="submit" size="sm" disabled={savingProfile}>
            {savingProfile ? "Saving…" : "Save Changes"}
          </Button>
        </form>
      </Card>

      {/* Card 2: Change Password */}
      <Card>
        <h2 className="font-display text-lg text-ink-900">Change Password</h2>
        <p className="text-xs text-ink-500 mt-0.5">
          Ensure your account uses a secure password (minimum 8 characters). Changing your password will invalidate all other active sessions.
        </p>

        <form onSubmit={handlePasswordSubmit} className="mt-5 space-y-4 max-w-lg">
          <div>
            <Label htmlFor="currentPassword">Current Password</Label>
            <Input
              id="currentPassword"
              type="password"
              required
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="••••••••••••"
            />
          </div>

          <div>
            <Label htmlFor="newPassword">New Password</Label>
            <Input
              id="newPassword"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimum 8 characters"
            />
          </div>

          <div>
            <Label htmlFor="confirmPassword">Confirm New Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
            />
          </div>

          {passwordError && <Alert tone="danger">{passwordError}</Alert>}
          {passwordSuccess && <Alert tone="success">{passwordSuccess}</Alert>}

          <Button type="submit" size="sm" disabled={savingPassword}>
            {savingPassword ? "Updating Password…" : "Update Password"}
          </Button>
        </form>
      </Card>

      {/* Card 3: Danger Zone */}
      <Card className="border-danger/30 bg-danger/[0.01]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg text-danger">Danger Zone</h2>
            <p className="text-xs text-ink-500 mt-0.5 max-w-md">
              Permanently delete your administrator account. This soft-deletes your account, invalidates all sessions immediately, and cannot be undone.
            </p>
          </div>

          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              setDeletePassword("");
              setDeleteConfirmationText("");
              setDeleteError(null);
              setDeleteModalOpen(true);
            }}
          >
            Delete Account
          </Button>
        </div>
      </Card>

      {/* Account Deletion Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-md shadow-2xl border-danger/40">
            <h3 className="font-display text-lg font-semibold text-danger">
              Delete Administrator Account
            </h3>
            <p className="mt-2 text-xs text-ink-600 leading-relaxed">
              This action is <strong className="text-ink-900">permanent</strong> and will immediately terminate your session.
              Existing events and certificates you created will be preserved, but you will permanently lose access to EnCertify.
            </p>

            <form onSubmit={handleDeleteAccount} className="mt-4 space-y-3.5">
              <div>
                <Label htmlFor="deletePassword">Confirm Your Password</Label>
                <Input
                  id="deletePassword"
                  type="password"
                  required
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="Enter your current password"
                />
              </div>

              <div>
                <Label htmlFor="deleteConfirmationText">
                  Type <span className="font-mono font-bold text-danger">DELETE</span> to confirm
                </Label>
                <Input
                  id="deleteConfirmationText"
                  type="text"
                  required
                  value={deleteConfirmationText}
                  onChange={(e) => setDeleteConfirmationText(e.target.value)}
                  placeholder="DELETE"
                />
              </div>

              {deleteError && <Alert tone="danger">{deleteError}</Alert>}

              <div className="mt-5 flex items-center justify-end gap-2 pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setDeleteModalOpen(false)}
                  disabled={deletingAccount}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="danger"
                  size="sm"
                  disabled={deletingAccount || deleteConfirmationText !== "DELETE"}
                >
                  {deletingAccount ? "Deleting…" : "Permanently Delete Account"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
