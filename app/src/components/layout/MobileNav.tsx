"use client";

/**
 * Mobile navigation. The trigger is a real button with aria-expanded, the panel
 * traps nothing but closes on Escape / outside click / navigation, and the body
 * scroll is not locked (a marketing menu should never freeze the page).
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { Locale } from "@/lib/i18n";

export interface MobileNavProps {
  locale: Locale;
  links: { href: string; label: string }[];
  signedIn: boolean;
  menuLabel: string;
  closeLabel: string;
  signInLabel: string;
  dashboardLabel: string;
  registerLabel: string;
}

export function MobileNav({
  locale,
  links,
  signedIn,
  menuLabel,
  closeLabel,
  signInLabel,
  dashboardLabel,
  registerLabel,
}: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onClick = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <div className="mobile-nav" ref={panelRef} style={{ marginInlineStart: "0.25rem" }}>
      <button
        type="button"
        className="mobile-nav__trigger"
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
        aria-label={open ? closeLabel : menuLabel}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="mobile-nav__bars" aria-hidden="true" data-open={open}>
          <i />
          <i />
          <i />
        </span>
      </button>

      {open ? (
        <div className="mobile-nav__panel" id="mobile-nav-panel">
          <nav className="stack-xs" aria-label={menuLabel}>
            {links.map((link) => (
              <Link key={link.href} href={`/${locale}${link.href}`} onClick={() => setOpen(false)}>
                {link.label}
              </Link>
            ))}
          </nav>
          <hr className="divider" />
          <div className="stack-xs">
            {signedIn ? (
              <Link className="btn btn--primary" href={`/${locale}/dashboard`} onClick={() => setOpen(false)}>
                {dashboardLabel}
              </Link>
            ) : (
              <>
                <Link className="btn btn--outline" href={`/${locale}/login`} onClick={() => setOpen(false)}>
                  {signInLabel}
                </Link>
                <Link className="btn btn--primary" href={`/${locale}/register`} onClick={() => setOpen(false)}>
                  {registerLabel}
                </Link>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
