"use client";

import { useEffect } from "react";

/**
 * Reveals every `[data-reveal]` element as it scrolls into view.
 *
 * Mounted once per page and driven by a single IntersectionObserver, so the
 * page itself stays a server component — nothing here ships per-section.
 * Elements start hidden in CSS, so if this never runs (reduced motion, or a
 * failure) they are switched on immediately rather than left invisible; the
 * page also carries a <noscript> fallback for the same reason.
 */
export function ScrollReveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (els.length === 0) return;

    const show = (el: Element) => el.classList.add("is-visible");

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      els.forEach(show);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          show(entry.target);
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
    );

    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return null;
}
