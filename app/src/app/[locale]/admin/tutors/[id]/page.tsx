import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AdminDenied } from "@/components/admin/AdminShell";
import { DocumentLink } from "@/components/admin/DocumentLink";
import { ActionButton } from "@/components/forms/ActionButton";
import { ActionForm } from "@/components/forms/ActionForm";
import { AdminHeading, Money, StatusPill, TableScroll, TutorStatus } from "@/components/admin/ui";
import { adminGate } from "@/lib/admin/guard";
import { getTutorAdmin, listPlansAdmin } from "@/lib/admin/queries";
import { listTutorDocuments } from "@/lib/documents/service";
import { createTranslator, formatDateTime, formatMoney, resolveLocale, type DictKey } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const DOC_KIND_KEYS: Record<string, DictKey> = {
  identity: "tutor.documents.kind.identity",
  degree: "tutor.documents.kind.degree",
  certificate: "tutor.documents.kind.certificate",
  experience: "tutor.documents.kind.experience",
  other: "tutor.documents.kind.other",
};

/**
 * /[locale]/admin/tutors/[id] — tutor review screen (§15, §21, §37).
 *
 * Three jobs in one place, in the order an operator does them: read the
 * application, open the documents (each open is audited), then decide the
 * profile or the subscription.
 */
export default async function AdminTutorDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: rawLocale, id } = await params;
  const locale = resolveLocale(rawLocale);
  const gate = await adminGate("tutor.read");
  if (!gate.ok) {
    if (gate.reason === "unauthenticated") redirect(`/${locale}/admin/login`);
    return <AdminDenied locale={locale} reason="forbidden" />;
  }

  const t = createTranslator(locale);
  const { dbReady, data } = await getTutorAdmin(id);
  if (!data) notFound();
  const perms = gate.ctx.session.permissions;

  const [documents, plans] = await Promise.all([
    listTutorDocuments(id).catch(() => []),
    listPlansAdmin(),
  ]);
  const { tutor } = data;

  return (
    <div className="admin-section">
      <AdminHeading
        kicker={t("admin.tutors.title")}
        title={tutor.fullName ?? tutor.email}
        subtitle={`${t("admin.audit.entityId")}: ${tutor.id}`}
        actions={
          <Link className="btn btn--quiet btn--sm" href={`/${locale}/admin/tutors`}>
            {t("cta.back")}
          </Link>
        }
      />

      {!dbReady ? <p className="notice notice--warn">{t("error.notConfigured")}</p> : null}

      <div className="admin-split">
        <div className="admin-section">
          <div className="card stack-sm">
            <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
              <TutorStatus locale={locale} status={tutor.status} />
              <StatusPill tone={tutor.accountStatus === "active" ? "ok" : "danger"} label={t(`admin.users.status.${tutor.accountStatus}` as DictKey)} />
              <span className="chip chip--pale">{t("label.phone")}: <span translate="no" className="tnum">{tutor.phone}</span></span>
              <span className="chip chip--pale">{t("auth.email")}: <span translate="no">{tutor.email}</span></span>
            </div>
            <dl className="admin-meta">
              <div>
                <dt>{t("tutor.form.qualification")}</dt>
                <dd>{tutor.qualification ?? "—"}</dd>
              </div>
              <div>
                <dt>{t("tutor.form.university")}</dt>
                <dd>{tutor.university ?? "—"}</dd>
              </div>
              <div>
                <dt>{t("tutor.form.major")}</dt>
                <dd>{tutor.major ?? "—"}</dd>
              </div>
              <div>
                <dt>{t("tutor.form.graduationYear")}</dt>
                <dd className="tnum">{tutor.graduationYear ?? "—"}</dd>
              </div>
              <div>
                <dt>{t("tutor.form.yearsExperience")}</dt>
                <dd className="tnum">{tutor.yearsExperience}</dd>
              </div>
              <div>
                <dt>{t("label.price")}</dt>
                <dd>
                  <Money value={tutor.pricePerHour} locale={locale} />
                </dd>
              </div>
              <div>
                <dt>{t("label.area")}</dt>
                <dd>{tutor.city ?? "—"}</dd>
              </div>
              <div>
                <dt>{t("tutor.form.subjects")}</dt>
                <dd>{data.subjects.map((s) => s.name).join(" · ") || "—"}</dd>
              </div>
              <div>
                <dt>{t("tutor.form.stages")}</dt>
                <dd>{data.stages.map((s) => s.name).join(" · ") || "—"}</dd>
              </div>
              <div>
                <dt>{t("label.method")}</dt>
                <dd>
                  {tutor.teachesHome ? t("tutor.card.home") : ""}
                  {tutor.teachesHome && tutor.teachesOnline ? " · " : ""}
                  {tutor.teachesOnline ? t("tutor.card.online") : ""}
                </dd>
              </div>
            </dl>
            {tutor.headlineAr ? <p className="soft">{tutor.headlineAr}</p> : null}
            {tutor.bioAr ? <p className="soft" style={{ maxWidth: "75ch" }}>{tutor.bioAr}</p> : null}
            {tutor.rejectionReason ? (
              <p className="notice notice--warn">
                {t("tutor.rejectionReason")}: {tutor.rejectionReason}
              </p>
            ) : null}
          </div>

          <div className="card stack-sm">
            <h2 style={{ fontSize: "1.05rem" }}>{t("admin.tutors.documents")}</h2>
            {documents.length === 0 ? (
              <p className="soft">{t("admin.tutors.noDocuments")}</p>
            ) : (
              <TableScroll>
                <thead>
                  <tr>
                    <th>{t("tutor.documents.upload")}</th>
                    <th>{t("label.status")}</th>
                    <th>{t("label.date")}</th>
                    <th>{t("admin.actions.action")}</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((document) => (
                    <tr key={document.id}>
                      <td>{t(DOC_KIND_KEYS[document.kind] ?? "tutor.documents.kind.other")}</td>
                      <td>
                        <StatusPill
                          tone={document.status === "approved" ? "ok" : document.status === "rejected" ? "danger" : "warn"}
                          label={t(`tutor.documents.status.${document.status}` as DictKey)}
                        />
                      </td>
                      <td className="tnum">{formatDateTime(document.createdAt, locale)}</td>
                      <td>
                        <div className="admin-actions">
                          {perms.has("tutor.document.read") ? (
                            <DocumentLink locale={locale} documentId={document.id} label={t("admin.tutors.openDocument")} />
                          ) : (
                            <span className="field__hint">{t("state.forbidden")}</span>
                          )}
                          {perms.has("tutor.edit") ? (
                            <>
                              <ActionButton
                                locale={locale}
                                endpoint="/api/admin/tutors"
                                payload={{ action: "document_decision", documentId: document.id, decision: "approved" }}
                                label={t("tutor.documents.status.approved")}
                                successText={t("admin.actions.done")}
                              />
                              <ActionButton
                                locale={locale}
                                endpoint="/api/admin/tutors"
                                payload={{ action: "document_decision", documentId: document.id, decision: "rejected" }}
                                label={t("admin.tutors.reject")}
                                variant="danger"
                                reasonLabel={t("admin.tutors.rejectReason")}
                                reasonRequired
                                successText={t("admin.actions.done")}
                              />
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TableScroll>
            )}
          </div>

          <div className="card stack-sm">
            <h2 style={{ fontSize: "1.05rem" }}>{t("admin.bookings.title")}</h2>
            <p className="soft">
              {t("tutor.dashboard.stats.bookings")}: <span className="tnum">{data.lessons.upcoming + data.lessons.completed + data.lessons.cancelled}</span>
            </p>
            <div className="admin-meta">
              <span>
                {t("booking.status.completed")}: <span className="tnum">{data.lessons.completed}</span>
              </span>
              <span>
                {t("booking.status.cancelled")}: <span className="tnum">{data.lessons.cancelled}</span>
              </span>
              <Link className="btn btn--quiet btn--sm" href={`/${locale}/admin/bookings?search=${encodeURIComponent(tutor.email)}`}>
                {t("admin.bookings.title")}
              </Link>
            </div>
          </div>
        </div>

        <div className="admin-section">
          <div className="card stack-sm">
            <h2 style={{ fontSize: "1.05rem" }}>{t("admin.actions.action")}</h2>
            <div className="admin-actions">
              {perms.has("tutor.approve") ? (
                <>
                  <ActionButton
                    locale={locale}
                    endpoint="/api/admin/tutors"
                    payload={{ action: "under_review", tutorId: tutor.id }}
                    label={t("admin.tutors.underReview")}
                    disabled={tutor.status === "under_review"}
                  />
                  <ActionButton
                    locale={locale}
                    endpoint="/api/admin/tutors"
                    payload={{ action: "approve", tutorId: tutor.id }}
                    label={t("admin.tutors.approve")}
                    variant="primary"
                    confirmText={t("admin.tutors.approveConfirm")}
                    disabled={tutor.status === "approved"}
                  />
                </>
              ) : null}
              {perms.has("tutor.reject") ? (
                <ActionButton
                  locale={locale}
                  endpoint="/api/admin/tutors"
                  payload={{ action: "reject", tutorId: tutor.id }}
                  label={t("admin.tutors.reject")}
                  variant="danger"
                  reasonLabel={t("admin.tutors.rejectReason")}
                  reasonRequired
                />
              ) : null}
              {perms.has("tutor.suspend") ? (
                <>
                  <ActionButton
                    locale={locale}
                    endpoint="/api/admin/tutors"
                    payload={{ action: "suspend", tutorId: tutor.id }}
                    label={t("admin.tutors.suspend")}
                    variant="danger"
                    reasonLabel={t("admin.tutors.suspendReason")}
                    reasonRequired
                    disabled={tutor.status === "suspended"}
                  />
                  <ActionButton
                    locale={locale}
                    endpoint="/api/admin/tutors"
                    payload={{ action: "reactivate", tutorId: tutor.id }}
                    label={t("admin.tutors.reactivate")}
                    disabled={tutor.status === "approved"}
                  />
                </>
              ) : null}
            </div>
          </div>

          {perms.has("subscription.manage") && plans.data.length > 0 ? (
            <ActionForm
              locale={locale}
              endpoint="/api/admin/tutors"
              title={t("admin.tutors.subscription")}
              help={
                tutor.subscriptionStatus === "active" && tutor.subscriptionExpiresAt
                  ? `${t("tutor.subscription.expiryDate")}: ${formatDateTime(tutor.subscriptionExpiresAt, locale)}`
                  : t("tutor.subscription.none")
              }
              extra={{ action: "activate_subscription", tutorId: tutor.id }}
              resetAfterSubmit
              fields={[
                {
                  kind: "select",
                  name: "planId",
                  label: t("admin.plans.selectPlan"),
                  value: plans.data[0]?.id ?? "",
                  options: plans.data.map((plan) => ({
                    value: plan.id,
                    label: `${locale === "ar" ? plan.nameAr : plan.nameEn} — ${formatMoney(plan.price, locale)}`,
                  })),
                },
                {
                  kind: "number",
                  name: "recordPaymentAmount",
                  label: t("admin.payments.recordSubscriptionPayment"),
                  help: t("pricing.faq.a2"),
                  min: 0,
                  step: 0.001,
                },
              ]}
              submitLabel={t("admin.plans.activate")}
              successText={t("admin.plans.activated")}
            />
          ) : perms.has("subscription.manage") ? (
            <div className="card stack-xs">
              <strong>{t("admin.plans.title")}</strong>
              <p className="soft">{t("admin.plans.subtitle")}</p>
              <Link className="btn btn--outline btn--sm" href={`/${locale}/admin/plans`}>
                {t("admin.plans.title")}
              </Link>
            </div>
          ) : null}

          {perms.has("tutor.edit") ? (
            <ActionForm
              locale={locale}
              endpoint="/api/admin/tutors"
              title={t("admin.tutors.editProfile")}
              variant="outline"
              extra={{ action: "edit", tutorId: tutor.id }}
              fields={[
                { kind: "text", name: "headlineAr", label: `${t("tutor.form.headline")} (AR)`, value: tutor.headlineAr, maxLength: 140 },
                { kind: "text", name: "headlineEn", label: `${t("tutor.form.headline")} (EN)`, value: tutor.headlineEn, maxLength: 140, dir: "ltr" },
                { kind: "number", name: "pricePerHour", label: t("tutor.form.pricePerHour"), value: Number(tutor.pricePerHour), min: 0.5, max: 1000, step: 0.5 },
                { kind: "checkbox", name: "teachesHome", label: t("tutor.form.teachesHome"), value: tutor.teachesHome },
                { kind: "checkbox", name: "teachesOnline", label: t("tutor.form.teachesOnline"), value: tutor.teachesOnline },
                { kind: "textarea", name: "adminNotes", label: t("admin.audit.reason"), value: tutor.adminNotes, rows: 2 },
              ]}
              submitLabel={t("cta.save")}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
