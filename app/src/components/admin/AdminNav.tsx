"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { createTranslator, type DictKey, type Locale } from "@/lib/i18n";

export interface AdminNavProps {
  locale: Locale;
  items: { href: string; labelKey: string }[];
}

/**
 * Console navigation.
 *
 * A client component only because the active item depends on the pathname. The
 * list it renders was already filtered by permission on the server, but the
 * pages re-check independently - a hidden link is presentation, never access
 * control.
 */
export function AdminNav({ locale, items }: AdminNavProps) {
  const t = createTranslator(locale);
  const pathname = usePathname();
  const base = `/${locale}/admin`;

  return (
    <nav className="admin-nav" aria-label={t("admin.title")}>
      {items.map((item) => {
        const href = `${base}${item.href}`;
        const active = item.href === "" ? pathname === base || pathname === `${base}/` : pathname.startsWith(href);
        return (
          <Link key={href} href={href} className={active ? "admin-nav__link is-active" : "admin-nav__link"} aria-current={active ? "page" : undefined}>
            {t(item.labelKey as DictKey)}
          </Link>
        );
      })}
    </nav>
  );
}
