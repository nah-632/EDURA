import Link from "next/link";
import { redirect } from "next/navigation";

import { AreaNav } from "@/components/account/AreaNav";
import { requirePageSession } from "@/lib/auth/server";
import { unreadCount } from "@/lib/notifications/service";
import { createTranslator, resolveLocale } from "@/lib/i18n";
import { dbConfigured } from "@/lib/db";

/**
 * Customer area layout (§7.1, §26).
 *
 * The guard lives in the layout as well as in every page: a layout protects the
 * chrome (so a signed-out visitor never sees the account navigation), and the
 * per-page check is what actually protects data. `force-dynamic` because a
 * cached dashboard would show one account another account's bookings.
 */
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = resolveLocale(rawLocale);
  const gate = await requirePageSession();
  if (!gate.ok) redirect(`/${locale}/login?next=/dashboard`);

  const t = createTranslator(locale);
  const unread = dbConfigured() ? await unreadCount(gate.session.user.id).catch(() => 0) : 0;

  const items = [
    { href: "", labelKey: "dashboard.overview" },
    { href: "/bookings", labelKey: "booking.list.title" },
    { href: "/students", labelKey: "students.title" },
    { href: "/notifications", labelKey: unread > 0 ? `notifications.title` : "notifications.title" },
    { href: "/account", labelKey: "account.title" },
  ];

  return (
    <div className="admin-shell">
      <header className="admin-shell__header">
        <div className="shell admin-shell__inner">
          <div className="stack-xs">
            <span className="kicker tracked">{t("dashboard.title")}</span>
            <strong>{t("dashboard.welcome", { name: gate.session.user.fullName })}</strong>
          </div>
          <div className="row" style={{ gap: "0.5rem", alignItems: "center" }}>
            {unread > 0 ? (
              <Link className="chip chip--gold" href={`/${locale}/dashboard/notifications`}>
                {t("notifications.unread")}: <span className="tnum">{unread}</span>
              </Link>
            ) : null}
            <Link className="btn btn--outline btn--sm" href={`/${locale}/tutors`}>
              {t("dashboard.findTutor")}
            </Link>
            <Link className="btn btn--quiet btn--sm" href={`/${locale}`}>
              {t("misc.backHome")}
            </Link>
          </div>
        </div>
      </header>
      <div className="shell admin-shell__nav">
        <AreaNav locale={locale} base="/dashboard" items={items} />
      </div>
      <main className="shell admin-shell__body" id="main">
        {children}
      </main>
    </div>
  );
}
