import Link from "next/link";

import { AreaNav } from "@/components/account/AreaNav";
import { requirePageSession } from "@/lib/auth/server";
import { createTranslator, resolveLocale } from "@/lib/i18n";

/**
 * Tutor area layout (§7.2).
 *
 * `requireTutor` is checked here so the chrome never renders for a non-tutor
 * account, but the important case is the middle one: a signed-in customer who
 * is NOT a tutor gets an explanation and the path to apply, instead of a
 * login redirect for an account they are already signed in to.
 */
export const dynamic = "force-dynamic";

export default async function TutorLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = resolveLocale(rawLocale);
  const gate = await requirePageSession({ requireTutor: true });
  const t = createTranslator(locale);

  if (!gate.ok) {
    return (
      <section className="section">
        <div className="shell legal-layout">
          <div className="card stack-sm">
            <span className="kicker tracked">{t("tutor.dashboard.title")}</span>
            <h1 className="display display--section" style={{ fontSize: "var(--text-h3)" }}>
              {gate.reason === "unauthenticated" ? t("auth.signInToContinue") : t("tutor.join.title")}
            </h1>
            <p className="soft">{gate.reason === "unauthenticated" ? t("auth.guestBrowsing") : t("tutor.join.lead")}</p>
            <div className="row">
              <Link
                className="btn btn--primary btn--sm"
                href={gate.reason === "unauthenticated" ? `/${locale}/login` : `/${locale}/register`}
              >
                {gate.reason === "unauthenticated" ? t("auth.submitLogin") : t("cta.becomeTutor")}
              </Link>
              <Link className="btn btn--quiet btn--sm" href={`/${locale}/pricing`}>
                {t("nav.becomeTutor")}
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const items = [
    { href: "", labelKey: "dashboard.overview" },
    { href: "/bookings", labelKey: "tutor.requests.title" },
    { href: "/profile", labelKey: "tutor.form.section.personal" },
    { href: "/availability", labelKey: "tutor.availability.title" },
    { href: "/documents", labelKey: "tutor.documents.title" },
    { href: "/subscription", labelKey: "tutor.subscription.title" },
  ];

  return (
    <div className="admin-shell">
      <header className="admin-shell__header">
        <div className="shell admin-shell__inner">
          <div className="stack-xs">
            <span className="kicker tracked">{t("tutor.dashboard.title")}</span>
            <strong>{gate.session.user.fullName}</strong>
          </div>
          <div className="row" style={{ gap: "0.5rem" }}>
            <Link className="btn btn--outline btn--sm" href={`/${locale}/dashboard`}>
              {t("nav.dashboard")}
            </Link>
            <Link className="btn btn--quiet btn--sm" href={`/${locale}`}>
              {t("misc.backHome")}
            </Link>
          </div>
        </div>
      </header>
      <div className="shell admin-shell__nav">
        <AreaNav locale={locale} base="/tutor" items={items} />
      </div>
      <main className="shell admin-shell__body" id="main">
        {children}
      </main>
    </div>
  );
}
