import Link from "next/link";

import { createTranslator, type Locale } from "@/lib/i18n";
import { EduraLogo } from "@/components/brand/EduraLogo";
import { brandMugUrl } from "@/lib/brand/hero-photo";

export interface FooterProps {
  locale: Locale;
  whatsappNumber: string;
  supportEmail: string;
  platformName: string;
}

export function Footer({ locale, whatsappNumber, supportEmail, platformName }: FooterProps) {
  const t = createTranslator(locale);
  const year = new Date().getFullYear();
  const waDigits = whatsappNumber.replace(/[^\d]/g, "");

  return (
    <footer className="site-footer">
      <div className="shell">
        <div className="site-footer__grid">
          <div className="stack-sm">
            <span style={{ color: "#fff" }}>
              <EduraLogo height={30} title={platformName} />
            </span>
            <p style={{ maxWidth: "30ch" }}>{t("brand.tagline")}</p>
            <p className="tracked" style={{ color: "var(--brand-light)", fontSize: "0.82rem" }}>
              {t("footer.supportHours")}
            </p>
          </div>

          <div>
            <h4>{t("footer.forStudents")}</h4>
            <nav className="stack-xs">
              <Link href={`/${locale}/tutors`}>{t("nav.tutors")}</Link>
              <Link href={`/${locale}/how`}>{t("nav.how")}</Link>
              <Link href={`/${locale}/rules`}>{t("nav.about")}</Link>
              <Link href={`/${locale}/login`}>{t("nav.login")}</Link>
            </nav>
          </div>

          <div>
            <h4>{t("footer.forTutors")}</h4>
            <nav className="stack-xs">
              <Link href={`/${locale}/pricing`}>{t("nav.becomeTutor")}</Link>
              <Link href={`/${locale}/tutor/apply`}>{t("tutor.join.step1")}</Link>
              <Link href={`/${locale}/legal/tutor-terms`}>{t("legal.tutorTerms.title")}</Link>
            </nav>
          </div>

          <div>
            <h4>{t("footer.legal")}</h4>
            <nav className="stack-xs">
              <Link href={`/${locale}/about`}>{t("about.kicker")}</Link>
              <Link href={`/${locale}/legal/terms`}>{t("legal.terms.title")}</Link>
              <Link href={`/${locale}/legal/privacy`}>{t("legal.privacy.title")}</Link>
              <Link href={`/${locale}/legal/guarantee`}>{t("guarantee.title")}</Link>
              <Link href={`/${locale}/legal/cancellation`}>{t("legal.cancellation.title")}</Link>
              <Link href={`/${locale}/legal/refund`}>{t("legal.refund.title")}</Link>
              <Link href={`/${locale}/legal/safety`}>{t("legal.safety.title")}</Link>
            </nav>
          </div>

          <div>
            <h4>{t("footer.contact")}</h4>
            <nav className="stack-xs">
              <a href={`https://wa.me/${waDigits}`} target="_blank" rel="noopener noreferrer">
                {t("legal.contact.whatsapp")}
              </a>
              <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
              <Link href={`/${locale}/contact`}>{t("legal.contact.title")}</Link>
            </nav>
          </div>
        </div>

        <div className="site-footer__bottom">
          <div className="site-footer__sig">
            {/* The product shot is a brand asset, not content: it sits in the
                footer at signature size rather than competing on the landing
                flow. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="site-footer__mug"
              src={brandMugUrl()}
              alt=""
              width={900}
              height={502}
              loading="lazy"
              decoding="async"
            />
            <span>
              © {year} {platformName} — {t("footer.rights")}
            </span>
          </div>
          <span>{t("footer.disclaimer")}</span>
        </div>
      </div>
    </footer>
  );
}
