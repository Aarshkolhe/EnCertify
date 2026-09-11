import clsx from "clsx";

/**
 * The Encypherist logo, used exactly as supplied — the full lockup (circuit
 * pencil, ENCYPHERIST wordmark, tagline) with no cropping or recolouring.
 *
 * Source of truth is `public/logo.png`, duplicated as `src/app/icon.png`,
 * which the App Router serves as the favicon.
 *
 * The artwork carries its own black ground, so it needs no tile behind it.
 * `object-contain` keeps the whole lockup visible at every size, and the
 * intrinsic dimensions are declared so the image reserves its space and does
 * not shift the layout as it loads.
 */

const SRC = "/logo.png";
const WIDTH = 627;
const HEIGHT = 625;

/** The logo at in-app sizes — header, sidebar, footer. */
export function LogoTile({ className }: { className?: string }) {
  return (
    <img
      src={SRC}
      alt=""
      width={WIDTH}
      height={HEIGHT}
      className={clsx("shrink-0 rounded object-contain", className)}
    />
  );
}

/** The same logo at display size, where the wordmark and tagline are legible. */
export function LogoFull({ className }: { className?: string }) {
  return (
    <img
      src={SRC}
      alt="Encypherist"
      width={WIDTH}
      height={HEIGHT}
      className={clsx("rounded-lg object-contain", className)}
    />
  );
}

/** Logo plus the EnCertify wordmark — the lockup used in headers and footer. */
export function Logo({
  className,
  tileClassName,
  wordClassName
}: {
  className?: string;
  tileClassName?: string;
  wordClassName?: string;
}) {
  return (
    <span className={clsx("flex items-center gap-2.5", className)}>
      <LogoTile className={clsx("h-10 w-10", tileClassName)} />
      <span
        className={clsx("font-display text-lg tracking-tight text-ink-900", wordClassName)}
      >
        EnCertify
      </span>
    </span>
  );
}
