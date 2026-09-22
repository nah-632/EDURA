import Link from "next/link";

import { createTranslator, type DictKey, type Locale } from "@/lib/i18n";

/**
 * Console chrome + the two "you cannot be here" states.
 *
 * `AdminDenied` renders EITHER an invitation to sign in (no session) or an
 * explanation (session without the permission). It never redirects on its own:
 * the page decides, so a deep link the operator cannot open still shows them
 * the console rather than bouncing them somewhere unexpected.
 */
export function AdminShell({
  locale,
  title,
  subtitle,
  nav,
  adminLabel,
  children,
}: {
  locale: Locale;
  title: string;
  subtitle?: string;
  nav?: React.ReactNode;
  adminLabel: string;
  children: React.ReactNode;
}) {
  const t = createTranslator(locale);
  return (
    <div className="admin-shell">
      <header className="admin-shell__header">
        <div className="shell admin-shell__inner">
          <div className="stack-xs">
            <strong>{title}</strong>
            {subtitle ? <span className="field__hint">{subtitle}</span> : null}
          </div>
          <div className="row" style={{ gap: "0.5rem", alignItems: "center" }}>
            <span className="field__hint" translate="no">
              {adminLabel}
            </span>
            <Link className="btn btn--quiet btn--sm" href={`/${locale}`}>
              {t("misc.backHome")}
            </Link>
          </div>
        </div>
      </header>
      {nav ? <div className="shell admin-shell__nav">{nav}</div> : null}
      <main className="shell admin-shell__body" id="main">
        {children}
      </main>
    </div>
  );
}

export function AdminDenied({
  locale,
  reason,
  labelKey,
}: {
  locale: Locale;
  reason: "unauthenticated" | "forbidden";
  labelKey?: DictKey;
}) {
  const t = createTranslator(locale);
  const headingKey: DictKey = reason === "unauthenticated" ? "admin.signInTitle" : "admin.unauthorized";
  const bodyKey: DictKey = reason === "unauthenticated" ? "admin.signInBody" : "state.forbidden";

  return (
    <section className="section">
      <div className="shell legal-layout">
        <div className="card stack-sm">
          <h1 className="display display--section" style={{ fontSize: "var(--text-h3)" }}>
            {t(headingKey)}
          </h1>
          <p className="soft">{t(bodyKey)}</p>
          {reason === "unauthenticated" ? (
            <div className="row">
              <Link className="btn btn--primary btn--sm" href={`/${locale}/admin/login`}>
                {t("auth.submitLogin")}
              </Link>
              <Link className="btn btn--quiet btn--sm" href={`/${locale}`}>
                {t("misc.backHome")}
              </Link>
            </div>
          ) : (
            <Link className="btn btn--quiet btn--sm" href={`/${locale}/admin`}>
              {t("admin.nav.overview")}
            </Link>
          )}
          {labelKey ? <p className="field__hint">{t(labelKey)}</p> : null}
        </div>
      </div>
    </section>
  );
}
