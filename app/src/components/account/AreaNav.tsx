"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { createTranslator, type DictKey, type Locale } from "@/lib/i18n";

export interface AreaNavProps {
  locale: Locale;
  /** "" for the area root; the rest are appended to it */
  base: string;
  items: { href: string; labelKey: string }[];
}

/**
 * Navigation for the customer and tutor areas.
 *
 * `base` is the area root (`/ar/dashboard`, `/ar/tutor`), so the same component
 * serves both without a second copy of the active-state logic. The root item is
 * only active on an exact match - otherwise "overview" would stay highlighted on
 * every child page.
 */
export function AreaNav({ locale, base, items }: AreaNavProps) {
  const t = createTranslator(locale);
  const pathname = usePathname();
  const root = `/${locale}${base}`;

  return (
    <nav className="admin-nav" aria-label={t("dashboard.title")}>
      {items.map((item) => {
        const href = `${root}${item.href}`;
        const active = item.href === "" ? pathname === root || pathname === `${root}/` : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={active ? "admin-nav__link is-active" : "admin-nav__link"}
            aria-current={active ? "page" : undefined}
          >
            {t(item.labelKey as DictKey)}
          </Link>
        );
      })}
    </nav>
  );
}
