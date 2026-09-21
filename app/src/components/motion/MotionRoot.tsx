"use client";

/**
 * One small client component owns every motion behaviour on marketing pages:
 *
 *  - scroll reveal   `[data-reveal]` fades/translates in once, staggered by the
 *                    `--reveal-i` custom property (line-by-line cadence)
 *  - parallax        `[data-parallax]` translates by a few percent of its own
 *                    height, driven by rAF on scroll (never on every event)
 *  - header state    `.site-header[data-scrolled]` for the hairline border
 *
 * Deliberately not a wrapper component: pages stay server-rendered, and all of
 * this degrades to plain visible content when JS is off or the visitor prefers
 * reduced motion (the hidden state only exists under `html.has-motion`).
 */
import { useEffect } from "react";

const REVEAL_MARGIN = "0px 0px -12% 0px";
const PARALLAX_MAX = 0.04; // never more than 4% of the element's height

export function MotionRoot() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduce.matches) {
      document.documentElement.classList.remove("has-motion");
      return;
    }

    const revealed = new WeakSet<Element>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-revealed");
          revealed.add(entry.target);
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: REVEAL_MARGIN, threshold: 0.12 },
    );

    const observeReveals = () => {
      document.querySelectorAll("[data-reveal]:not(.is-revealed)").forEach((el) => {
        if (revealed.has(el)) return;
        observer.observe(el);
      });
    };
    observeReveals();

    // Any element that scrolls into view after a client-side navigation or a
    // late data render is picked up by a MutationObserver-free re-scan.
    const rescan = window.setInterval(observeReveals, 1200);
    const stopRescan = window.setTimeout(() => window.clearInterval(rescan), 12_000);

    // --- parallax -----------------------------------------------------------
    const layers = Array.from(document.querySelectorAll<HTMLElement>("[data-parallax]"));
    let frame = 0;
    const applyParallax = () => {
      frame = 0;
      const vh = window.innerHeight;
      for (const layer of layers) {
        const rect = layer.getBoundingClientRect();
        if (rect.bottom < -200 || rect.top > vh + 200) continue;
        const progress = (rect.top + rect.height / 2 - vh / 2) / vh; // -1..1
        const shift = Math.max(-1, Math.min(1, progress)) * PARALLAX_MAX * rect.height;
        layer.style.setProperty("--parallax-y", `${(-shift).toFixed(2)}px`);
      }
    };
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(applyParallax);
    };

    // --- header state -------------------------------------------------------
    const header = document.querySelector<HTMLElement>(".site-header");
    const onHeaderScroll = () => {
      if (!header) return;
      header.dataset.scrolled = window.scrollY > 8 ? "true" : "false";
    };

    if (layers.length) {
      applyParallax();
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll, { passive: true });
    }
    window.addEventListener("scroll", onHeaderScroll, { passive: true });
    onHeaderScroll();

    return () => {
      observer.disconnect();
      window.clearInterval(rescan);
      window.clearTimeout(stopRescan);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("scroll", onHeaderScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}

/**
 * Stagger index helper. Kept as a plain function so server components can use
 * it without pulling client code in.
 */
export function revealIndex(i: number): { "data-reveal": ""; style: { "--reveal-i": number } } {
  return { "data-reveal": "", style: { "--reveal-i": i } };
}
