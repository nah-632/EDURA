/**
 * Console/dashboard preview harness.
 *
 * `next build` and `next dev` cannot complete in this environment (see
 * docs/06-testing.md §2b), so this harness renders the REAL components with the
 * REAL compiled stylesheet to static HTML, which the browser can then display.
 *
 * It is deliberately not a mock-up: every element below is the shipped
 * component — Kpi/KpiGrid/StatusPill/TableScroll from components/admin/ui.tsx,
 * the client components (ActionButton, ActionForm, UploadForm, AvailabilityEditor,
 * StudentManager, NotificationPanel) and the console shell.
 *
 * Run:
 *   node node_modules/tailwindcss/lib/cli.js -c tailwind.config.js \
 *     -i src/styles/globals.css -o <out>/styles.css
 *   esbuild src/preview/render-console.tsx --bundle --platform=node --format=esm \
 *     --alias:@=./src --alias:next/link=./src/preview/stubs/next-link.js \
 *     --alias:next/navigation=./src/preview/stubs/next-navigation.js \
 *     --outfile=/tmp/render-console.mjs
 *   node /tmp/render-console.mjs <out>
 */
import { renderToStaticMarkup } from "react-dom/server";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { AdminNav } from "@/components/admin/AdminNav";
import { AdminShell } from "@/components/admin/AdminShell";
import * as UI from "@/components/admin/ui";
import { ActionButton } from "@/components/forms/ActionButton";
import { ActionForm } from "@/components/forms/ActionForm";
import { UploadForm } from "@/components/forms/UploadForm";
import { StudentManager } from "@/components/account/StudentManager";
import { AvailabilityEditor } from "@/components/tutor/AvailabilityEditor";
import { TutorProfileForm } from "@/components/tutor/TutorProfileForm";
import { ReviewForm } from "@/components/booking/ReviewForm";
import { createTranslator, localeDir, localeMeta, type Locale } from "@/lib/i18n";

const outDir = process.argv[2] ?? "/tmp/edura-console";
mkdirSync(outDir, { recursive: true });

const BOOKINGS = [
  { code: "EDU-20092026-0001", tutor: "أحمد المناعي", student: "زهراء", subject: "الرياضيات", date: "2026-09-25", time: "17:00", price: "8.500", status: "pending_payment" },
  { code: "EDU-20092026-0002", tutor: "أحمد المناعي", student: "حسين", subject: "الفيزياء", date: "2026-09-27", time: "18:30", price: "11.900", status: "confirmed" },
  { code: "EDU-20092026-0003", tutor: "مريم بوچيري", student: "مريم", subject: "اللغة الإنجليزية", date: "2026-09-18", time: "16:00", price: "6.000", status: "completed" },
  { code: "EDU-20092026-0004", tutor: "يوسف كانو", student: "زهراء", subject: "الكيمياء", date: "2026-09-21", time: "19:00", price: "9.000", status: "cancelled" },
];

const TUTORS = [
  { name: "أحمد المناعي", status: "approved", area: "الرفاع", price: "8.500", docs: 3, sub: "فعّال حتى 15 أكتوبر" },
  { name: "مريم بوچيري", status: "under_review", area: "المنامة", price: "6.000", docs: 2, sub: "بانتظار التحقق" },
  { name: "يوسف كانو", status: "pending", area: "مدينة عيسى", price: "9.000", docs: 1, sub: "بدون اشتراك" },
  { name: "حسن الزياني", status: "suspended", area: "المحرق", price: "7.000", docs: 4, sub: "منتهٍ" },
];

function shell(locale: Locale, inner: React.ReactNode, title: string): string {
  const t = createTranslator(locale);
  const items = [
    { href: "", labelKey: "admin.nav.overview" },
    { href: "/tutors", labelKey: "admin.nav.tutors" },
    { href: "/bookings", labelKey: "admin.nav.bookings" },
    { href: "/payments", labelKey: "admin.nav.payments" },
    { href: "/settings", labelKey: "admin.nav.settings" },
    { href: "/audit", labelKey: "admin.nav.audit" },
  ];
  return renderToStaticMarkup(
    <AdminShell locale={locale} title={title} subtitle={t("admin.signInBody")} adminLabel="admin@edura.world" nav={<AdminNav locale={locale} items={items} />}>
      {inner}
    </AdminShell>,
  );
}

function overview(locale: Locale) {
  const t = createTranslator(locale);
  return (
    <>
      <UI.AdminHeading
        kicker={t("admin.title")}
        title={t("admin.overview.title")}
        subtitle={t("admin.overview.last14")}
        actions={
          <>
            <ActionButton locale={locale} endpoint="#" payload={{}} label={t("admin.tutors.title")} variant="outline" />
            <ActionButton locale={locale} endpoint="#" payload={{}} label={t("admin.payments.title")} variant="outline" />
          </>
        }
      />
      <UI.KpiGrid>
        <UI.Kpi label={t("admin.overview.activeTutors")} value={3} />
        <UI.Kpi label={t("admin.overview.pendingTutors")} value={2} warn />
        <UI.Kpi label={t("admin.overview.students")} value={12} />
        <UI.Kpi label={t("admin.overview.totalBookings")} value={41} />
        <UI.Kpi label={t("admin.overview.pendingPayments")} value={2} warn />
        <UI.Kpi label={t("admin.overview.revenue")} value="45.000" hint={t("label.currency")} />
      </UI.KpiGrid>
      <div className="admin-split">
        <div className="admin-section">
          <div className="card stack-sm">
            <h2 style={{ fontSize: "1.05rem" }}>{t("admin.overview.recentBookings")}</h2>
            <UI.TableScroll>
              <thead>
                <tr>
                  <th>{t("booking.idLabel")}</th>
                  <th>{t("booking.step.tutor")}</th>
                  <th>{t("label.date")}</th>
                  <th>{t("label.price")}</th>
                  <th>{t("label.status")}</th>
                </tr>
              </thead>
              <tbody>
                {BOOKINGS.map((b) => (
                  <tr key={b.code}>
                    <td className="tnum">{b.code}</td>
                    <td>{b.tutor}</td>
                    <td className="tnum">{b.date} {b.time}</td>
                    <td><UI.Money value={b.price} locale={locale} /></td>
                    <td><UI.BookingStatus locale={locale} status={b.status} /></td>
                  </tr>
                ))}
              </tbody>
            </UI.TableScroll>
          </div>
          <div className="card stack-sm">
            <h2 style={{ fontSize: "1.05rem" }}>{t("admin.overview.last14")}</h2>
            <UI.BarChart
              rows={[
                { label: "09-14", value: 2 },
                { label: "09-15", value: 5 },
                { label: "09-16", value: 3 },
                { label: "09-17", value: 7 },
                { label: "09-18", value: 4 },
                { label: "09-19", value: 9 },
                { label: "09-20", value: 6 },
              ]}
              emptyLabel={t("admin.overview.noData")}
            />
          </div>
        </div>
        <div className="admin-section">
          <div className="card stack-sm">
            <h2 style={{ fontSize: "1.05rem" }}>{t("admin.overview.recentAudit")}</h2>
            <ul className="admin-list">
              {["tutor.approve", "payment.verified", "booking.status_change", "user.restrict"].map((action, i) => (
                <li key={action}>
                  <span translate="no">{action}</span>
                  <span className="admin-meta">
                    <span>admin@edura.world</span>
                    <span className="tnum">20/09 2{i}:1{i}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="card stack-sm">
            <h2 style={{ fontSize: "1.05rem" }}>{t("admin.payments.title")}</h2>
            <ul className="admin-list">
              <li>
                <span>{t("admin.payments.verifiedAt")}</span>
                <span className="admin-meta"><UI.PaymentStatus locale={locale} status="verified" /><span className="tnum">18</span></span>
              </li>
              <li>
                <span>{t("admin.overview.pendingPayments")}</span>
                <span className="admin-meta"><UI.PaymentStatus locale={locale} status="submitted" /><span className="tnum">2</span></span>
              </li>
              <li>
                <span>{t("payment.status.refunded")}</span>
                <span className="admin-meta"><UI.PaymentStatus locale={locale} status="refunded" /><span className="tnum">1</span></span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}

function tutorReview(locale: Locale) {
  const t = createTranslator(locale);
  return (
    <>
      <UI.AdminHeading
        kicker={t("admin.tutors.title")}
        title={t("admin.tutors.title")}
        subtitle={t("admin.tutors.subtitle")}
        actions={<span className="field__hint tnum">{t("admin.table.total")}: 4</span>}
      />
      <nav className="admin-filter" aria-label={t("admin.tutors.filterStatus")}>
        <a href="#" aria-current="true">{t("label.all")}</a>
        <a href="#">{t("tutor.status.pending")}</a>
        <a href="#">{t("tutor.status.approved")}</a>
        <a href="#">{t("tutor.status.suspended")}</a>
      </nav>
      <UI.TableScroll>
        <thead>
          <tr>
            <th>{t("auth.fullName")}</th>
            <th>{t("label.status")}</th>
            <th>{t("label.area")}</th>
            <th>{t("label.price")}</th>
            <th>{t("admin.tutors.subscription")}</th>
            <th>{t("admin.tutors.documents")}</th>
            <th>{t("admin.actions.action")}</th>
          </tr>
        </thead>
        <tbody>
          {TUTORS.map((tutor) => (
            <tr key={tutor.name}>
              <td>
                {tutor.name}
                <div className="field__hint" translate="no">tutor@demo.edura.bh</div>
              </td>
              <td><UI.TutorStatus locale={locale} status={tutor.status} /></td>
              <td>{tutor.area}</td>
              <td><UI.Money value={tutor.price} locale={locale} /></td>
              <td className="field__hint">{tutor.sub}</td>
              <td className="tnum">{tutor.docs}</td>
              <td>
                <div className="admin-actions">
                  <ActionButton locale={locale} endpoint="#" payload={{}} label={t("admin.users.detail")} variant="quiet" />
                  <ActionButton locale={locale} endpoint="#" payload={{}} label={t("admin.tutors.approve")} variant="primary" />
                  <ActionButton locale={locale} endpoint="#" payload={{}} label={t("admin.tutors.reject")} variant="danger" reasonLabel={t("admin.tutors.rejectReason")} reasonRequired />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </UI.TableScroll>
      <ActionForm
        locale={locale}
        endpoint="#"
        title={t("admin.settings.title")}
        fields={[
          { kind: "text", name: "whatsappNumber", label: t("admin.settings.whatsappNumber"), value: "+97366661238", dir: "ltr" },
          { kind: "number", name: "guaranteeClaimWindowHours", label: t("guarantee.badge.replacement", { hours: 48 }), value: 48, min: 1, max: 720 },
          { kind: "checkbox", name: "reviewModeration", label: t("admin.settings.reviewModeration"), value: true },
        ]}
        submitLabel={t("cta.save")}
      />
    </>
  );
}

function dashboards(locale: Locale) {
  const t = createTranslator(locale);
  return (
    <>
      <UI.AdminHeading kicker={t("dashboard.title")} title={t("dashboard.welcome", { name: "فاطمة الزياني" })} subtitle={t("dashboard.quickActions")} />
      <UI.KpiGrid>
        <UI.Kpi label={t("dashboard.stats.activeBookings")} value={3} />
        <UI.Kpi label={t("dashboard.stats.completed")} value={9} />
        <UI.Kpi label={t("dashboard.stats.students")} value={2} />
        <UI.Kpi label={t("dashboard.stats.reviews")} value={4} />
      </UI.KpiGrid>
      <div className="admin-split">
        <div className="admin-section">
          <div className="card stack-sm">
            <h2 style={{ fontSize: "1.05rem" }}>{t("dashboard.upcomingLesson")}</h2>
            <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
              <UI.BookingStatus locale={locale} status="confirmed" />
              <span className="tnum">EDU-20092026-0002</span>
            </div>
            <dl className="admin-meta">
              <div><dt>{t("booking.step.tutor")}</dt><dd>أحمد المناعي</dd></div>
              <div><dt>{t("label.subject")}</dt><dd>الفيزياء</dd></div>
              <div><dt>{t("label.date")}</dt><dd className="tnum">27 سبتمبر 2026 · 06:30 م</dd></div>
              <div><dt>{t("label.price")}</dt><dd><UI.Money value="11.900" locale={locale} /></dd></div>
            </dl>
            <span className="btn btn--primary btn--sm">{t("booking.detail.title")}</span>
          </div>
          <ReviewForm locale={locale} bookingId="00000000-0000-4000-8000-000000000000" />
        </div>
        <div className="admin-section">
          <StudentManager
            locale={locale}
            currentYear={2026}
            stages={[{ id: "1", name: locale === "ar" ? "المرحلة الابتدائية" : "Primary" }]}
            students={[
              { id: "s1", fullName: "زهراء", stageId: "1", stageName: locale === "ar" ? "المرحلة الابتدائية" : "Primary", grade: "Grade 5", gender: "female", birthYear: 2015, notes: locale === "ar" ? "تحتاج تقوية في الرياضيات" : "Needs maths support" },
            ]}
          />
          <AvailabilityEditor locale={locale} initial={[{ weekday: 0, startTime: "16:00", endTime: "20:00" }]} timeOff={[]} />
          <UploadForm
            locale={locale}
            endpoint="#"
            title={t("tutor.documents.upload")}
            fields={[{ kind: "select", name: "kind", label: t("tutor.documents.title"), value: "identity", options: [{ value: "identity", label: t("tutor.documents.kind.identity") }] }]}
            fileLabel={t("tutor.documents.upload")}
            submitLabel={t("tutor.documents.upload")}
          />
        </div>
      </div>
    </>
  );
}

function document_(locale: Locale, title: string, body: string): string {
  return `<!doctype html>
<html lang="${localeMeta[locale].htmlLang}" dir="${localeDir[locale]}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>EDURA — ${title}</title>
<link rel="stylesheet" href="styles.css" />
</head>
<body>
${body}
</body>
</html>`;
}

const screens: Record<string, (locale: Locale) => string> = {
  "admin-overview": (locale) => shell(locale, overview(locale), createTranslator(locale)("admin.title")),
  "admin-tutors": (locale) => shell(locale, tutorReview(locale), createTranslator(locale)("admin.tutors.title")),
  dashboards: (locale) => shell(locale, dashboards(locale), createTranslator(locale)("dashboard.title")),
};

for (const [name, render] of Object.entries(screens)) {
  for (const locale of ["ar", "en"] as Locale[]) {
    const html = document_(locale, name, render(locale));
    const file = path.join(outDir, `${name}-${locale}.html`);
    writeFileSync(file, html);
    console.log(`wrote ${file} (${html.length} bytes)`);
  }
}

// An index so the whole set can be opened in one place.
writeFileSync(
  path.join(outDir, "index.html"),
  document_(
    "ar",
    "preview",
    `<section class="section"><div class="shell stack-sm">
      <span class="kicker tracked">EDURA — static preview harness</span>
      <h1 class="display display--section">لوحة الإدارة واللوحات — AR/EN</h1>
      <p class="soft">These pages are rendered from the REAL components with the REAL compiled stylesheet.
      The Next.js server cannot boot in this environment (see docs/06-testing.md §2b), so the harness exists
      to make the interface reviewable and breakable before deployment.</p>
      <ul class="admin-list">
        ${Object.keys(screens)
          .flatMap((name) =>
            (["ar", "en"] as Locale[]).map(
              (locale) => `<li><a href="${name}-${locale}.html">${name} · ${locale.toUpperCase()}</a></li>`,
            ),
          )
          .join("")}
      </ul>
    </div></section>`,
  ),
);
console.log(`wrote ${path.join(outDir, "index.html")}`);
