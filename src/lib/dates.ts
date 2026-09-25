export function formatCertificateDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date);
}

export function formatDate(input: string | Date | number | null | undefined): string {
  if (!input) return "—";
  const date = typeof input === "string" || typeof input === "number" ? new Date(input) : input;
  if (isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}
