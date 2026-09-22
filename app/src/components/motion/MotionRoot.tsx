"use client";

/**
 * One small client component owns the motion behaviours that are left:
 *
 *  - parallax        `[data-parallax]` translates by a few percent of its own
 *                    height, driven by rAF on scroll (never on every event)
 *  - header state    `.site-header[data-scrolled]` for the hairline border
 *
 * The scroll-reveal was removed on 2026-09-22 — see the note in globals.css. It
 * hid every `[data-reveal]` element and leaned on a CSS transition to show it
 * again, and on the live site that transition stuck at its start value, so the
 * whole page rendered blank behind the header. Content that is visible without
 * JavaScript is also simply more robust.
 *
 * Deliberately not a wrapper component: pages stay server-rendered.
 */
import { useEffect } from "react";

const PARALLAX_MAX = 0.04; // never more than 4% of the element's height

export function MotionRoot() {
  useEffect(() => {
    // `no-js` is set on <html> by the layout so a JS-less visitor is never
    // served the hidden state. Nothing removed it once the app hydrated.
    document.documentElement.classList.remove("no-js");

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduce.matches) {
      document.documentElement.classList.remove("has-motion");
      return;
    }

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
