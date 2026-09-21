import Link from "next/link";
import { createTranslator, localeMeta, otherLocale, switchLocalePath, type Locale } from "@/lib/i18n";
import { EduraLogo } from "@/components/brand/EduraLogo";
import { MobileNav } from "./MobileNav";

export interface HeaderProps {
  locale: Locale;
  /** current pathname without the locale prefix, used by the language switch */
  pathname?: string;
  signedIn?: boolean;
  isAdmin?: boolean;
  isTutor?: boolean;
}

export function Header({ locale, pathname = "/", signedIn = false, isAdmin = false, isTutor = false }: HeaderProps) {
  const t = createTranslator(locale);
  const target = otherLocale(locale);
  const links: { href: string; label: string }[] = [
    { href: "/tutors", label: t("nav.tutors") },
    { href: "/how", label: t("nav.how") },
    { href: "/pricing", label: t("nav.becomeTutor") },
    { href: "/rules", label: t("nav.about") },
  ];
  const switchHref = switchLocalePath(`/${locale}${pathname === "/" ? "" : pathname}`, target);

  return (
    <header className="site-header" data-scrolled="false">
      <div className="shell site-header__inner">
        <Link href={`/${locale}`} aria-label={t("a11y.logo")} style={{ color: "var(--deep)" }}>
          <EduraLogo height={28} title={t("brand.name")} />
        </Link>

        <nav className="site-header__nav" aria-label={t("nav.home")}>
          {links.map((link) => (
            <Link key={link.href} href={`/${locale}${link.href}`}>
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="site-header__spacer" />

        <div className="site-header__actions">
          <Link
            className="lang-switch tracked"
            href={switchHref}
            hrefLang={target}
            aria-label={`${t("a11y.switchLanguage")} — ${localeMeta[target].label}`}
          >
            {localeMeta[target].short}
          </Link>

          {signedIn ? (
            <>
              {isAdmin ? (
                <Link className="btn btn--outline btn--sm header__hide-sm" href={`/${locale}/admin`}>
                  {t("nav.admin")}
                </Link>
              ) : null}
              <Link
                className="btn btn--primary btn--sm header__hide-sm"
                href={isTutor ? `/${locale}/tutor` : `/${locale}/dashboard`}
              >
                {t("nav.dashboard")}
              </Link>
            </>
          ) : (
            <>
              <Link className="btn btn--quiet btn--sm header__hide-sm" href={`/${locale}/login`}>
                {t("nav.login")}
              </Link>
              <Link className="btn btn--primary btn--sm header__hide-sm" href={`/${locale}/register`}>
                {t("cta.becomeTutor")}
              </Link>
            </>
          )}
        </div>

        <MobileNav
          locale={locale}
          links={links}
          signedIn={signedIn}
          menuLabel={t("a11y.openMenu")}
          closeLabel={t("a11y.closeMenu")}
          signInLabel={t("nav.login")}
          dashboardLabel={t("nav.dashboard")}
          registerLabel={t("nav.register")}
        />
      </div>
    </header>
  );
}
