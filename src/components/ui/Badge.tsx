import clsx from "clsx";
import type { HTMLAttributes } from "react";

export function Badge({
  className,
  tone = "neutral",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "success" | "danger" | "seal" }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium",
        tone === "neutral" && "bg-ink-50 text-ink-700",
        tone === "success" && "bg-success/10 text-success",
        tone === "danger" && "bg-danger/10 text-danger",
        tone === "seal" && "bg-seal/10 text-seal-dark",
        className
      )}
      {...props}
    />
  );
}
