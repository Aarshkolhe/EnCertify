import { NextRequest } from "next/server";
import { resolveAppBaseUrl } from "@/lib/url";
import type { Certificate, Event, CertificateStatus } from "@prisma/client";

export interface PublicCertificateRecord {
  certificateId: string;
  recipientName: string;
  eventName: string;
  semester: string | null;
  issuedAt: string;
  status: "valid" | "revoked";
  viewUrl: string;
  downloadUrl: string;
}

export interface PublicVerifyCertificate {
  certificateId: string;
  recipientName: string;
  eventName: string;
  semester: string | null;
  issuedAt: string;
}

/**
 * Escapes SQL wildcards (%, _, \) and regex metacharacters in user query string
 * to prevent wildcard dumping or regex injection.
 */
export function sanitizeSearchQuery(query: string): string {
  // Trim and escape SQL LIKE / regex special characters
  return query.trim().replace(/([%_\\])/g, "\\$1");
}

/**
 * Formats a Date object as YYYY-MM-DD string.
 */
export function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Resolves the EnCertify deployment base URL for building links.
 */
export function getPublicBaseUrl(req: NextRequest): string {
  return resolveAppBaseUrl(req.nextUrl.origin);
}

/**
 * Maps a Certificate model to the public API result shape.
 * Privacy guarantee: never returns participantEmail, phone, or other private fields.
 */
export function formatPublicCertificate(
  cert: Pick<Certificate, "certificateId" | "participantName" | "issueDate" | "status"> & {
    event: Pick<Event, "name">;
  },
  baseUrl: string
): PublicCertificateRecord {
  const status: "valid" | "revoked" =
    cert.status === "VALID" ? "valid" : "revoked";

  return {
    certificateId: cert.certificateId,
    recipientName: cert.participantName,
    eventName: cert.event.name,
    semester: null,
    issuedAt: formatIsoDate(cert.issueDate),
    status,
    viewUrl: `${baseUrl}/c/${cert.certificateId}`,
    downloadUrl: `${baseUrl}/api/public/certificates/${cert.certificateId}/download`
  };
}

/**
 * Maps a Certificate model to the public verify certificate shape.
 */
export function formatVerifyCertificate(
  cert: Pick<Certificate, "certificateId" | "participantName" | "issueDate"> & {
    event: Pick<Event, "name">;
  }
): PublicVerifyCertificate {
  return {
    certificateId: cert.certificateId,
    recipientName: cert.participantName,
    eventName: cert.event.name,
    semester: null,
    issuedAt: formatIsoDate(cert.issueDate)
  };
}
