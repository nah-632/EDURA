import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { createTranslator, type Locale } from "@/lib/i18n";
import { cmsText, fillPlaceholders, readCmsContent } from "@/lib/cms/public";
import { guaranteeSummary } from "@/lib/guarantee/rules";
import { getGuaranteeConfig } from "@/lib/settings";

export const revalidate = 3600;

/**
 * Legal & policy pages.
 *
 * One route, dictionary-driven content: every document is a list of
 * (heading, body) key pairs so nothing is duplicated across languages and a
 * missing translation fails loudly in the i18n test rather than silently
 * rendering an empty section.
 *
 * Two documents are special:
 *  - `guarantee` renders its commercial numbers from PLATFORM SETTINGS, so the
 *    published promise is the same number the claim decision uses (addendum §C).
 *  - `privacy` carries the addendum's cookies and legal-basis sections.
 *
 * Clauses that need a lawyer before commercial launch are flagged with
 * `legal.reviewPlaceholder`.
 */
const DOCS = {
  terms: {
    titleKey: "legal.terms.title",
    introKey: "legal.terms.intro",
    sections: [
      ["legal.terms.s1", "legal.terms.s1.body"],
      ["legal.terms.s2", "legal.terms.s2.body"],
      ["legal.terms.s3", "legal.terms.s3.body"],
      ["legal.terms.s4", "legal.terms.s4.body"],
      ["legal.terms.s5", "legal.terms.s5.body"],
      ["legal.terms.s6", "legal.terms.s6.body"],
      ["legal.terms.s7", "legal.terms.s7.body"],
      ["legal.terms.s8", "legal.terms.s8.body"],
    ],
    reviewed: false,
  },
  privacy: {
    titleKey: "legal.privacy.title",
    introKey: "legal.privacy.intro",
    sections: [
      ["legal.privacy.s1", "legal.privacy.s1.body"],
      ["legal.privacy.s2", "legal.privacy.s2.body"],
      ["legal.privacy.s3", "legal.privacy.s3.body"],
      ["legal.privacy.s4", "legal.privacy.s4.body"],
      ["legal.privacy.s5", "legal.privacy.s5.body"],
      ["legal.privacy.s6", "legal.privacy.s6.body"],
      ["legal.privacy.s7", "legal.privacy.s7.body"],
      ["legal.privacy.s8", "legal.privacy.s8.body"],
      ["legal.privacy.s9", "legal.privacy.s9.body"],
    ],
    badgeKey: "legal.privacy.minorBadge",
    reviewed: false,
  },
  guarantee: {
    titleKey: "guarantee.title",
    introKey: "guarantee.intro",
    sections: [
      ["guarantee.verification.title", "guarantee.verification.body"],
      ["guarantee.satisfaction.title", "guarantee.satisfaction.body"],
      ["guarantee.payment.title", "guarantee.payment.body"],
      ["guarantee.notCovered.title", "guarantee.notCovered.lead"],
      ["guarantee.claim.title", "guarantee.claim.body"],
    ],
    reviewed: false,
  },
  cancellation: {
    titleKey: "legal.cancellation.title",
    introKey: null,
    sections: [
      ["legal.cancellation.s1", "legal.cancellation.s1.body"],
      ["legal.cancellation.s2", "legal.cancellation.s2.body"],
      ["legal.cancellation.s3", "legal.cancellation.s3.body"],
      ["legal.cancellation.s4", "legal.cancellation.s4.body"],
    ],
    reviewed: true,
  },
  refund: {
    titleKey: "legal.refund.title",
    introKey: null,
    sections: [
      ["legal.refund.s1", "legal.refund.s1.body"],
      ["legal.refund.s2", "legal.refund.s2.body"],
      ["legal.refund.s3", "legal.refund.s3.body"],
    ],
    reviewed: true,
  },
  safety: {
    titleKey: "legal.safety.title",
    introKey: null,
    sections: [
      ["legal.safety.s1", "legal.safety.s1.body"],
      ["legal.safety.s2", "legal.safety.s2.body"],
      ["legal.safety.s3", "legal.safety.s3.body"],
      ["legal.safety.s4", "legal.safety.s4.body"],
    ],
    reviewed: true,
  },
  "tutor-terms": {
    titleKey: "legal.tutorTerms.title",
    introKey: null,
    sections: [
      ["legal.tutorTerms.s1", "legal.tutorTerms.s1.body"],
      ["legal.tutorTerms.s2", "legal.tutorTerms.s2.body"],
      ["legal.tutorTerms.s3", "legal.tutorTerms.s3.body"],
      ["legal.tutorTerms.s4", "legal.tutorTerms.s4.body"],
    ],
    reviewed: false,
  },
} as const;

type DocSlug = keyof typeof DOCS;

export function generateStaticParams() {
  return Object.keys(DOCS).map((doc) => ({ doc }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; doc: string }>;
}): Promise<Metadata> {
  const { locale, doc } = await params;
  const entry = DOCS[doc as DocSlug];
  if (!entry) return {};
  const t = createTranslator(locale as Locale);
  return {
    title: t(entry.titleKey as never),
    alternates: { canonical: `/${locale}/legal/${doc}` },
  };
}

export default async function LegalPage({
  params,
}: {
  params: Promise<{ locale: string; doc: string }>;
}) {
  const { locale: rawLocale, doc } = await params;
  const entry = DOCS[doc as DocSlug];
  if (!entry) notFound();
  const locale = rawLocale as Locale;
  const t = createTranslator(locale);
  const updated = "2026-09-20";

  const [cms, guarantee] = await Promise.all([readCmsContent(), getGuaranteeConfig()]);
  const numbers = guaranteeSummary(guarantee);
  const vars = {
    hours: numbers.claimWindowHours,
    sessions: numbers.maxCompletedSessions,
  };

  /** Body text for a section: CMS override first, dictionary default second. */
  const bodyOf = (bodyKey: string): string => {
    if (doc === "guarantee" && bodyKey === "guarantee.satisfaction.body") {
      return fillPlaceholders(
        cmsText(cms, "guaranteeSatisfaction", locale, t("guarantee.satisfaction.body")),
        vars,
      );
    }
    return t(bodyKey as never);
  };

  return (
    <section className="section">
      <div className="shell legal-layout">
        <header className="stack-xs">
          <h1 className="display display--section">{t(entry.titleKey as never)}</h1>
          <p className="field__hint">{t("legal.lastUpdated", { date: updated })}</p>
          {entry.introKey ? <p className="lead">{t(entry.introKey as never)}</p> : null}
          {"badgeKey" in entry && entry.badgeKey ? (
            <p className="notice notice--info">{t(entry.badgeKey as never)}</p>
          ) : null}
        </header>

        {!entry.reviewed ? <p className="notice notice--warn">{t("legal.reviewNote")}</p> : null}

        <div className="stack">
          {entry.sections.map(([headingKey, bodyKey], index) => (
            <article className="card stack-xs" key={headingKey}>
              <h2 style={{ fontSize: "1.05rem" }}>
                <span className="muted tnum" style={{ marginInlineEnd: "0.5rem" }}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                {t(headingKey as never)}
              </h2>
              {!entry.reviewed ? (
                <span className="chip chip--gold">{t("legal.reviewPlaceholder")}</span>
              ) : null}
              <p className="soft">{bodyOf(bodyKey)}</p>

              {/* The guarantee's limits are a real list, so they are rendered as
                  one - a paragraph of three negations reads as a disclaimer. */}
              {doc === "guarantee" && bodyKey === "guarantee.notCovered.lead" ? (
                <ul className="stack-xs" style={{ margin: 0, paddingInlineStart: "1.1rem" }}>
                  {(["guarantee.notCovered.p1", "guarantee.notCovered.p2", "guarantee.notCovered.p3"] as const).map(
                    (key) => (
                      <li key={key} className="soft">
                        {t(key)}
                      </li>
                    ),
                  )}
                </ul>
              ) : null}
            </article>
          ))}
        </div>

        {doc === "guarantee" ? (
          <p className="notice notice--warn">{t("guarantee.reviewNote")}</p>
        ) : null}

        <div className="card stack-xs">
          <h2 style={{ fontSize: "1.05rem" }}>{t("legal.contact.title")}</h2>
          <p className="soft">{t("legal.contact.body")}</p>
          <div className="row">
            <a className="btn btn--outline btn--sm" href={`/${locale}/contact`}>
              {t("legal.contact.formTitle")}
            </a>
            {doc !== "privacy" ? (
              <a className="btn btn--quiet btn--sm" href={`/${locale}/legal/privacy`}>
                {t("legal.privacy.title")}
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
