"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { readError } from "@/lib/fetchJson";
import { formatDate } from "@/lib/dates";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: "SUPER_ADMIN" | "ADMIN";
  status: "INVITED" | "ACTIVE" | "SUSPENDED" | "REMOVED";
  createdAt: string;
  updatedAt: string;
  _count?: {
    events: number;
    templates: number;
  };
}

interface AccessRequest {
  id: string;
  fullName: string;
  email: string;
  department: string | null;
  organization: string | null;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewedById: string | null;
  reviewedBy?: {
    id: string;
    name: string;
    email: string;
  } | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
}

interface AuditLogEntry {
  id: string;
  action: string;
  actorAdmin?: { id: string; name: string; email: string } | null;
  targetAdmin?: { id: string; name: string; email: string } | null;
  requestId?: string | null;
  metadata?: any;
  createdAt: string;
}

export function AccessRequestsManager({
  currentAdminId
}: {
  currentAdminId: string;
}) {
  const [activeTab, setActiveTab] = useState<"requests" | "admins" | "audit">("requests");
  const [statusFilter, setStatusFilter] = useState<"PENDING" | "APPROVED" | "REJECTED" | "ALL">("PENDING");

  // Requests state
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [requestsError, setRequestsError] = useState<string | null>(null);

  // Admins state
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [adminViewFilter, setAdminViewFilter] = useState<"ACTIVE" | "REMOVED">("ACTIVE");
  const [adminsLoading, setAdminsLoading] = useState(false);
  const [adminsError, setAdminsError] = useState<string | null>(null);

  // Audit logs state
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Approval modal & Activation Link state
  const [approvingReq, setApprovingReq] = useState<AccessRequest | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activationUrl, setActivationUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Rejection modal state
  const [rejectingReq, setRejectingReq] = useState<AccessRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  // Admin status / role modal state
  const [actionModal, setActionModal] = useState<{
    type: "suspend" | "reactivate" | "promote" | "demote" | "remove";
    admin: AdminUser;
  } | null>(null);

  // Load requests
  const loadRequests = useCallback(async () => {
    setRequestsLoading(true);
    setRequestsError(null);
    try {
      const res = await fetch(`/api/admin/access-requests?status=${statusFilter}`);
      if (!res.ok) throw new Error(await readError(res, "Failed to load requests."));
      const data = await res.json();
      setRequests(data.requests || []);
    } catch (err) {
      setRequestsError(err instanceof Error ? err.message : "Failed to load requests.");
    } finally {
      setRequestsLoading(false);
    }
  }, [statusFilter]);

  // Load admins
  const loadAdmins = useCallback(async () => {
    setAdminsLoading(true);
    setAdminsError(null);
    try {
      const url =
        adminViewFilter === "REMOVED"
          ? "/api/admin/users?status=REMOVED"
          : "/api/admin/users";
      const res = await fetch(url);
      if (!res.ok) throw new Error(await readError(res, "Failed to load admins."));
      const data = await res.json();
      setAdmins(data.admins || []);
    } catch (err) {
      setAdminsError(err instanceof Error ? err.message : "Failed to load admins.");
    } finally {
      setAdminsLoading(false);
    }
  }, [adminViewFilter]);

  // Load audit logs
  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const res = await fetch("/api/admin/audit-logs");
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch {
      // Ignore
    } finally {
      setLogsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "requests") {
      loadRequests();
    } else if (activeTab === "admins") {
      loadAdmins();
    } else if (activeTab === "audit") {
      loadLogs();
    }
  }, [activeTab, loadRequests, loadAdmins, loadLogs]);

  // Approve action
  async function confirmApprove() {
    if (!approvingReq) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/access-requests/${approvingReq.id}/approve`, {
        method: "POST"
      });
      if (!res.ok) throw new Error(await readError(res, "Approval failed."));
      const data = await res.json();
      setActivationUrl(data.activationUrl);
      loadRequests();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Approval failed.");
    } finally {
      setActionLoading(false);
    }
  }

  // Reject action
  async function confirmReject() {
    if (!rejectingReq) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/access-requests/${rejectingReq.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rejectionReason: rejectionReason.trim() || null })
      });
      if (!res.ok) throw new Error(await readError(res, "Rejection failed."));
      setRejectingReq(null);
      setRejectionReason("");
      loadRequests();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Rejection failed.");
    } finally {
      setActionLoading(false);
    }
  }

  // Admin status/role action
  async function confirmAdminAction() {
    if (!actionModal) return;
    setActionLoading(true);
    setActionError(null);
    const { type, admin } = actionModal;

    try {
      let res: Response;
      if (type === "remove") {
        res = await fetch(`/api/admin/users/${admin.id}/remove`, {
          method: "POST"
        });
      } else if (type === "suspend" || type === "reactivate") {
        const nextStatus = type === "suspend" ? "SUSPENDED" : "ACTIVE";
        res = await fetch(`/api/admin/users/${admin.id}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus })
        });
      } else {
        const nextRole = type === "promote" ? "SUPER_ADMIN" : "ADMIN";
        res = await fetch(`/api/admin/users/${admin.id}/role`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: nextRole })
        });
      }

      if (!res.ok) throw new Error(await readError(res, "Operation failed."));
      setActionModal(null);
      loadAdmins();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Operation failed.");
    } finally {
      setActionLoading(false);
    }
  }

  // Re-invite action
  async function handleReinvite(admin: AdminUser) {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/users/${admin.id}/reinvite`, { method: "POST" });
      if (!res.ok) throw new Error(await readError(res, "Could not regenerate activation link."));
      const data = await res.json();
      setApprovingReq({
        id: "",
        fullName: admin.name,
        email: admin.email,
        department: null,
        organization: null,
        reason: "",
        status: "APPROVED",
        reviewedById: null,
        reviewedAt: null,
        rejectionReason: null,
        createdAt: admin.createdAt
      });
      setActivationUrl(data.activationUrl);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not regenerate activation link.");
    } finally {
      setActionLoading(false);
    }
  }

  function handleCopy() {
    if (!activationUrl) return;
    navigator.clipboard.writeText(activationUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-ink-900">Administrator Management</h1>
          <p className="mt-1 text-sm text-ink-500">
            Review onboarding requests, manage permissions, and maintain platform security.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex rounded-lg border border-border bg-white p-1 shadow-sm">
          <button
            onClick={() => setActiveTab("requests")}
            className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
              activeTab === "requests"
                ? "bg-ink-900 text-paper"
                : "text-ink-600 hover:text-ink-900"
            }`}
          >
            Access Requests
          </button>
          <button
            onClick={() => setActiveTab("admins")}
            className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
              activeTab === "admins"
                ? "bg-ink-900 text-paper"
                : "text-ink-600 hover:text-ink-900"
            }`}
          >
            Active Admins
          </button>
          <button
            onClick={() => setActiveTab("audit")}
            className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
              activeTab === "audit"
                ? "bg-ink-900 text-paper"
                : "text-ink-600 hover:text-ink-900"
            }`}
          >
            Audit Log
          </button>
        </div>
      </div>

      {/* TAB 1: ACCESS REQUESTS */}
      {activeTab === "requests" && (
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              {(["PENDING", "APPROVED", "REJECTED", "ALL"] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setStatusFilter(filter)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    statusFilter === filter
                      ? "bg-seal/15 text-seal-dark font-semibold"
                      : "bg-paper text-ink-500 hover:text-ink-900"
                  }`}
                >
                  {filter === "ALL" ? "All Requests" : filter.charAt(0) + filter.slice(1).toLowerCase()}
                </button>
              ))}
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={loadRequests}
              disabled={requestsLoading}
            >
              {requestsLoading ? "Refreshing…" : "Refresh"}
            </Button>
          </div>

          {requestsError && <Alert tone="danger">{requestsError}</Alert>}

          {requestsLoading ? (
            <Card>
              <div className="py-8 text-center text-sm text-ink-500">Loading access requests…</div>
            </Card>
          ) : requests.length === 0 ? (
            <Card>
              <p className="text-sm text-ink-400">
                No access requests found with status{" "}
                <span className="font-semibold text-ink-600">{statusFilter}</span>.
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {requests.map((req) => (
                <Card key={req.id}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2.5">
                        <span className="font-medium text-ink-900 text-base">{req.fullName}</span>
                        <span className="text-xs font-mono text-ink-500">({req.email})</span>
                        <Badge
                          tone={
                            req.status === "APPROVED"
                              ? "success"
                              : req.status === "REJECTED"
                              ? "danger"
                              : "seal"
                          }
                        >
                          {req.status}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500">
                        {req.organization && (
                          <span>Org: <strong className="text-ink-700">{req.organization}</strong></span>
                        )}
                        {req.department && (
                          <span>Dept: <strong className="text-ink-700">{req.department}</strong></span>
                        )}
                        <span>Submitted: {formatDate(req.createdAt)}</span>
                      </div>
                    </div>

                    {req.status === "PENDING" && (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setRejectingReq(req);
                            setRejectionReason("");
                            setActionError(null);
                          }}
                        >
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            setApprovingReq(req);
                            setActivationUrl(null);
                            setActionError(null);
                          }}
                        >
                          Approve & Issue Link
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 rounded border border-border/60 bg-ink-900/[0.02] p-3 text-xs text-ink-700">
                    <span className="font-semibold block text-ink-500 text-[11px] uppercase tracking-wide mb-1">
                      Reason for access:
                    </span>
                    <p className="whitespace-pre-wrap">{req.reason}</p>
                  </div>

                  {req.status === "REJECTED" && req.rejectionReason && (
                    <div className="mt-2 text-xs text-danger">
                      <span className="font-semibold">Rejection note:</span> {req.rejectionReason}
                    </div>
                  )}

                  {req.reviewedBy && (
                    <div className="mt-2 text-[11px] text-ink-400">
                      Reviewed by {req.reviewedBy.name} ({req.reviewedBy.email})
                      {req.reviewedAt && ` on ${formatDate(req.reviewedAt)}`}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ACTIVE ADMINS */}
      {activeTab === "admins" && (
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setAdminViewFilter("ACTIVE")}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  adminViewFilter === "ACTIVE"
                    ? "bg-seal/15 text-seal-dark font-semibold"
                    : "bg-paper text-ink-500 hover:text-ink-900"
                }`}
              >
                Active &amp; Invited
              </button>
              <button
                onClick={() => setAdminViewFilter("REMOVED")}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  adminViewFilter === "REMOVED"
                    ? "bg-seal/15 text-seal-dark font-semibold"
                    : "bg-paper text-ink-500 hover:text-ink-900"
                }`}
              >
                Removed (History)
              </button>
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={loadAdmins}
              disabled={adminsLoading}
            >
              {adminsLoading ? "Refreshing…" : "Refresh"}
            </Button>
          </div>

          {adminsError && <Alert tone="danger">{adminsError}</Alert>}

          {adminsLoading ? (
            <Card>
              <div className="py-8 text-center text-sm text-ink-500">Loading administrators…</div>
            </Card>
          ) : admins.length === 0 ? (
            <Card>
              <p className="text-sm text-ink-400">
                {adminViewFilter === "REMOVED"
                  ? "No removed administrators found."
                  : "No administrators found."}
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {admins.map((admin) => {
                const isSelf = admin.id === currentAdminId;
                const isSuper = admin.role === "SUPER_ADMIN";
                const isSuspended = admin.status === "SUSPENDED";
                const isInvited = admin.status === "INVITED";
                const isActive = admin.status === "ACTIVE";
                const isRemoved = admin.status === "REMOVED";

                const activeSuperAdminsCount = admins.filter(
                  (a) => a.role === "SUPER_ADMIN" && a.status === "ACTIVE"
                ).length;
                const isLastSuperAdmin = isSuper && isActive && activeSuperAdminsCount <= 1;

                return (
                  <Card key={admin.id}>
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2.5">
                          <span className="font-medium text-ink-900 text-base">{admin.name}</span>
                          <span className="text-xs font-mono text-ink-500">({admin.email})</span>
                          {isSelf && (
                            <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold text-ink-700">
                              You
                            </span>
                          )}
                          <Badge tone={isSuper ? "seal" : "neutral"}>
                            {isSuper ? "Super Admin" : "Admin"}
                          </Badge>
                          <Badge
                            tone={
                              isActive
                                ? "success"
                                : isSuspended || isRemoved
                                ? "danger"
                                : "neutral"
                            }
                          >
                            {admin.status}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-4 text-xs text-ink-400">
                          <span>Created: {formatDate(admin.createdAt)}</span>
                          {admin._count && (
                            <span>
                              {admin._count.events} event(s) · {admin._count.templates} template(s)
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {isRemoved ? (
                          <span className="text-xs text-ink-400 italic">
                            Account permanently removed
                          </span>
                        ) : (
                          <>
                            {isInvited && (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => handleReinvite(admin)}
                                disabled={actionLoading}
                              >
                                Get Activation Link
                              </Button>
                            )}

                            {isActive && !isSelf && (
                              <Button
                                variant="danger"
                                size="sm"
                                disabled={isLastSuperAdmin}
                                title={isLastSuperAdmin ? "Cannot suspend the only remaining active Super Admin." : undefined}
                                onClick={() => {
                                  setActionError(null);
                                  setActionModal({ type: "suspend", admin });
                                }}
                              >
                                Suspend
                              </Button>
                            )}

                            {isSuspended && (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                  setActionError(null);
                                  setActionModal({ type: "reactivate", admin });
                                }}
                              >
                                Reactivate
                              </Button>
                            )}

                            {!isSelf && isActive && (
                              isSuper ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={isLastSuperAdmin}
                                  title={isLastSuperAdmin ? "Cannot demote the only remaining active Super Admin." : undefined}
                                  onClick={() => {
                                    setActionError(null);
                                    setActionModal({ type: "demote", admin });
                                  }}
                                >
                                  Demote to Admin
                                </Button>
                              ) : (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => {
                                    setActionError(null);
                                    setActionModal({ type: "promote", admin });
                                  }}
                                >
                                  Promote to Super Admin
                                </Button>
                              )
                            )}

                            {!isSelf && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-danger hover:bg-danger/10 hover:text-danger"
                                disabled={isLastSuperAdmin}
                                title={isLastSuperAdmin ? "Cannot remove the only remaining active Super Admin." : undefined}
                                onClick={() => {
                                  setActionError(null);
                                  setActionModal({ type: "remove", admin });
                                }}
                              >
                                Remove
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: AUDIT LOG */}
      {activeTab === "audit" && (
        <div className="mt-6 space-y-4">
          <div className="flex justify-end">
            <Button
              variant="secondary"
              size="sm"
              onClick={loadLogs}
              disabled={logsLoading}
            >
              {logsLoading ? "Refreshing…" : "Refresh"}
            </Button>
          </div>

          {logsLoading ? (
            <Card>
              <div className="py-8 text-center text-sm text-ink-500">Loading audit trail…</div>
            </Card>
          ) : logs.length === 0 ? (
            <Card>
              <p className="text-sm text-ink-400">No audit log entries recorded yet.</p>
            </Card>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border bg-white shadow-sm">
              <table className="w-full text-left text-xs text-ink-700">
                <thead className="border-b border-border bg-paper font-semibold text-ink-900">
                  <tr>
                    <th className="px-4 py-3">Timestamp</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Actor</th>
                    <th className="px-4 py-3">Target / Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-ink-50/50">
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-ink-500">
                        {formatDate(log.createdAt)}
                      </td>
                      <td className="px-4 py-2.5 font-semibold text-ink-900">
                        <span className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[11px]">
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {log.actorAdmin ? (
                          <div>
                            <span className="font-medium text-ink-900">{log.actorAdmin.name}</span>
                            <span className="block text-[10px] text-ink-400">{log.actorAdmin.email}</span>
                          </div>
                        ) : (
                          <span className="italic text-ink-400">Applicant / System</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {log.targetAdmin ? (
                          <div>
                            <span className="font-medium text-ink-900">{log.targetAdmin.name}</span>
                            <span className="text-[10px] text-ink-400 ml-1">({log.targetAdmin.email})</span>
                          </div>
                        ) : log.metadata ? (
                          <span className="font-mono text-[10px] text-ink-600">
                            {JSON.stringify(log.metadata)}
                          </span>
                        ) : (
                          <span className="text-ink-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* APPROVAL / ACTIVATION MODAL */}
      {approvingReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-lg shadow-2xl">
            <h2 className="font-display text-xl text-ink-900">
              {activationUrl ? "Activation Link Generated" : "Approve Administrator Access"}
            </h2>

            {activationUrl ? (
              <div className="mt-4 space-y-4">
                <Alert tone="success">
                  <span className="font-semibold block">Account created and awaiting activation!</span>
                  Admin account created with status <strong>INVITED</strong> for {approvingReq.fullName}.
                </Alert>

                <div className="rounded-lg border border-seal-light bg-seal/5 p-4 text-xs text-ink-800">
                  <p className="font-semibold text-seal-dark mb-1">Important Security Delivery Notice:</p>
                  <p className="leading-relaxed">
                    Automated email dispatch is not configured. Copy this single-use activation link and securely deliver it privately to <strong>{approvingReq.email}</strong>.
                    The link will expire in <strong>24 hours</strong>.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-ink-700 mb-1">
                    One-Time Activation URL
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={activationUrl}
                      className="w-full rounded border border-border bg-ink-50 px-3 py-1.5 font-mono text-xs text-ink-900 select-all"
                    />
                    <Button onClick={handleCopy} size="sm">
                      {copied ? "Copied!" : "Copy Link"}
                    </Button>
                  </div>
                </div>

                <div className="flex justify-end pt-3">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setApprovingReq(null);
                      setActivationUrl(null);
                    }}
                  >
                    Done
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <p className="text-sm text-ink-600 leading-relaxed">
                  Are you sure you want to approve administrator access for{" "}
                  <strong className="text-ink-900">{approvingReq.fullName}</strong> ({approvingReq.email})?
                </p>

                <p className="text-xs text-ink-500">
                  This will provision an administrator account and create a secure one-time activation link allowing them to choose their password.
                </p>

                {actionError && <Alert tone="danger">{actionError}</Alert>}

                <div className="flex items-center justify-end gap-2 pt-3">
                  <Button
                    variant="secondary"
                    onClick={() => setApprovingReq(null)}
                    disabled={actionLoading}
                  >
                    Cancel
                  </Button>
                  <Button onClick={confirmApprove} disabled={actionLoading}>
                    {actionLoading ? "Approving…" : "Confirm Approval"}
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* REJECTION MODAL */}
      {rejectingReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-md shadow-2xl">
            <h2 className="font-display text-xl text-ink-900">Reject Access Request</h2>
            <p className="mt-2 text-sm text-ink-600">
              Rejecting request for <strong className="text-ink-900">{rejectingReq.fullName}</strong> ({rejectingReq.email}).
            </p>

            <div className="mt-4">
              <label htmlFor="rejectionReason" className="block text-xs font-medium text-ink-700 mb-1">
                Rejection Note / Reason (Optional)
              </label>
              <textarea
                id="rejectionReason"
                rows={3}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="E.g., Department affiliation could not be verified..."
                className="w-full rounded border border-border bg-white px-3 py-2 text-xs text-ink-900 placeholder:text-ink-400 focus:border-seal focus:outline-none focus:ring-1 focus:ring-seal"
              />
            </div>

            {actionError && <div className="mt-3"><Alert tone="danger">{actionError}</Alert></div>}

            <div className="flex items-center justify-end gap-2 pt-4">
              <Button
                variant="secondary"
                onClick={() => setRejectingReq(null)}
                disabled={actionLoading}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={confirmReject}
                disabled={actionLoading}
              >
                {actionLoading ? "Rejecting…" : "Confirm Rejection"}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ADMIN STATUS / ROLE CONFIRMATION MODAL */}
      {actionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-md shadow-2xl">
            <h2 className="font-display text-xl text-ink-900">
              {actionModal.type === "suspend" && "Suspend Administrator"}
              {actionModal.type === "reactivate" && "Reactivate Administrator"}
              {actionModal.type === "promote" && "Promote to Super Admin"}
              {actionModal.type === "demote" && "Demote to Admin"}
              {actionModal.type === "remove" && "Permanently Remove Administrator"}
            </h2>

            <div className="mt-3 text-sm text-ink-600 space-y-2">
              <p>
                Target administrator:{" "}
                <strong className="text-ink-900">{actionModal.admin.name}</strong> ({actionModal.admin.email})
              </p>

              {actionModal.type === "remove" && (
                <div className="rounded border border-danger/30 bg-danger/5 p-3 text-xs text-danger">
                  <p className="font-semibold">Permanent Action:</p>
                  <p className="mt-0.5 leading-relaxed">
                    Removing this administrator will soft-delete their account and immediately invalidate all of their active sessions. They will be permanently blocked from signing in again.
                  </p>
                </div>
              )}

              {actionModal.type === "suspend" && (
                <p className="text-xs text-danger">
                  Suspending this administrator will immediately invalidate their active sessions and prevent them from signing in or performing any administrative actions.
                </p>
              )}

              {actionModal.type === "reactivate" && (
                <p className="text-xs text-ink-500">
                  This will restore normal administrative access for this account.
                </p>
              )}

              {actionModal.type === "promote" && (
                <p className="text-xs text-ink-500">
                  Super Admins have full access to review access requests, modify administrator permissions, and manage the platform.
                </p>
              )}

              {actionModal.type === "demote" && (
                <p className="text-xs text-ink-500">
                  Demoting this account to regular Admin will remove their ability to manage other administrators or approve requests.
                </p>
              )}
            </div>

            {actionError && <div className="mt-3"><Alert tone="danger">{actionError}</Alert></div>}

            <div className="flex items-center justify-end gap-2 pt-4">
              <Button
                variant="secondary"
                onClick={() => setActionModal(null)}
                disabled={actionLoading}
              >
                Cancel
              </Button>
              <Button
                variant={actionModal.type === "suspend" || actionModal.type === "remove" ? "danger" : "primary"}
                onClick={confirmAdminAction}
                disabled={actionLoading}
              >
                {actionLoading ? "Processing…" : actionModal.type === "remove" ? "Remove Administrator" : "Confirm"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
