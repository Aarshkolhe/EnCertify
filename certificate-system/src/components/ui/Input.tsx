import clsx from "clsx";
import type { InputHTMLAttributes, LabelHTMLAttributes } from "react";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        "w-full rounded border border-border bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-seal focus:outline-none",
        className
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={clsx("mb-1.5 block text-sm font-medium text-ink-700", className)}
      {...props}
    />
  );
}
