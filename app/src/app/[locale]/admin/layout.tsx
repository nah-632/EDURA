import type { Metadata } from "next";

import { AdminNav } from "@/components/admin/AdminNav";
import { AdminShell } from "@/components/admin/AdminShell";
import { adminContext } from "@/lib/admin/guard";
import { adminNav } from "@/lib/admin/nav";
import { createTranslator, resolveLocale } from "@/lib/i18n";

/**
 * Console layout.
 *
 * The layout provides chrome only - it deliberately does NOT enforce access.
 * Every page calls `adminGate(permission)` itself, which is what makes a new
 * page impossible to ship unguarded (the same pattern used for the customer
 * dashboard). Rendering nothing when there is no session lets
 * `/[locale]/admin/login` live inside this route and still reach its form.
 *
 * `force-dynamic` because an admin session is per-request: a cached console
 * page would leak one operator's view to the next request.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = createTranslator(resolveLocale(locale));
  // The console is never indexed.
  return { title: t("admin.title"), robots: { index: false, follow: false } };
}

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = resolveLocale(rawLocale);
  const t = createTranslator(locale);
  const ctx = await adminContext();

  if (!ctx) return <>{children}</>;

  const items = adminNav
    .filter((item) => ctx.session.permissions.has(item.permission))
    .map((item) => ({ href: item.href, labelKey: item.labelKey }));

  return (
    <AdminShell
      locale={locale}
      title={t("admin.title")}
      subtitle={t("admin.signInBody")}
      adminLabel={ctx.actorLabel}
      nav={<AdminNav locale={locale} items={items} />}
    >
      {children}
    </AdminShell>
  );
}
