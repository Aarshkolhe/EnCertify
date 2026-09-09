import clsx from "clsx";
import type { HTMLAttributes } from "react";

export function Alert({
  className,
  tone = "neutral",
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone?: "neutral" | "danger" | "success" }) {
  return (
    <div
      role={tone === "danger" ? "alert" : undefined}
      className={clsx(
        "rounded border px-4 py-3 text-sm",
        tone === "neutral" && "border-border bg-ink-50 text-ink-700",
        tone === "danger" && "border-danger/30 bg-danger/5 text-danger",
        tone === "success" && "border-success/30 bg-success/5 text-success",
        className
      )}
      {...props}
    />
  );
}
