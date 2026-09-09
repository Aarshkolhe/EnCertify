import clsx from "clsx";
import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "md" ? "px-4 py-2 text-sm" : "px-3 py-1.5 text-xs",
        variant === "primary" && "bg-ink-900 text-paper hover:bg-ink-700",
        variant === "secondary" &&
          "border border-border bg-white text-ink-900 hover:bg-ink-50",
        variant === "ghost" && "text-ink-400 hover:bg-ink-50 hover:text-ink-900",
        variant === "danger" && "bg-danger text-white hover:bg-danger/90",
        className
      )}
      {...props}
    />
  );
}
