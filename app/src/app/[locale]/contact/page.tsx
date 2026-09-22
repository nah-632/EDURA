import type { Metadata } from "next";

import { createTranslator, type Locale } from "@/lib/i18n";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = createTranslator(locale as Locale);
  return { title: t("legal.contact.title"), alternates: { canonical: `/${locale}/contact` } };
}

export default async function ContactPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = rawLocale as Locale;
  const t = createTranslator(locale);
  const settings = await getSettings();
  const waDigits = settings.whatsappNumber.replace(/[^\d]/g, "");

  return (
    <section className="section">
      <div className="shell legal-layout">
        <header className="stack-sm">
          <h1 className="display display--section">{t("legal.contact.title")}</h1>
          <p className="lead">{t("legal.contact.body")}</p>
        </header>

        <div className="grid grid--2">
          <div className="card stack-xs">
            <h2 style={{ fontSize: "1.05rem" }}>{t("legal.contact.whatsapp")}</h2>
            <p className="soft tnum" dir="ltr">{settings.whatsappNumber}</p>
            <a className="btn btn--primary" href={`https://wa.me/${waDigits}`} target="_blank" rel="noopener noreferrer">
              {t("cta.openWhatsapp")}
            </a>
          </div>
          <div className="card stack-xs">
            <h2 style={{ fontSize: "1.05rem" }}>{t("legal.contact.email")}</h2>
            <p className="soft" dir="ltr">{settings.supportEmail}</p>
            <a className="btn btn--outline" href={`mailto:${settings.supportEmail}`}>
              {t("legal.contact.email")}
            </a>
          </div>
        </div>

        <p className="field__hint">{t("legal.contact.responseTime")}</p>
        <p className="notice notice--info">{t("state.comingSoon")} — {t("legal.contact.formTitle")}</p>
      </div>
    </section>
  );
}
