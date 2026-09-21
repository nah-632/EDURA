import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminDenied } from "@/components/admin/AdminShell";
import { DocumentLink } from "@/components/admin/DocumentLink";
import { ActionButton } from "@/components/forms/ActionButton";
import { AdminHeading, DataState, FilterLinks, Money, PaymentStatus, TableScroll } from "@/components/admin/ui";
import { adminGate } from "@/lib/admin/guard";
import { listPaymentsForAdmin } from "@/lib/payments/service";
import { createTranslator, formatDateTime, resolveLocale, type DictKey } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * /[locale]/admin/payments (§15, §36).
 *
 * The screen exists to answer one question per row: "did the money arrive, and
 * what did the customer say it was?" Proof reading is audited like every other
 * private-object access, and a proof that arrived on WhatsApp is labelled as
 * exactly that.
 */
export default async function AdminPaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; subject?: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = resolveLocale(rawLocale);
  const gate = await adminGate("payment.read");
  if (!gate.ok) {
    if (gate.reason === "unauthenticated") redirect(`/${locale}/admin/login`);
    return <AdminDenied locale={locale} reason="forbidden" />;
  }

  const query = await searchParams;
  const status = query.status ?? "all";
  const subject = query.subject ?? "all";
  const t = createTranslator(locale);
  const perms = gate.ctx.session.permissions;

  let dbReady = true;
  let payments: Awaited<ReturnType<typeof listPaymentsForAdmin>> = [];
  try {
    payments = await listPaymentsForAdmin({ statusFilter: status, subjectType: subject, limit: 200 });
  } catch {
    dbReady = false;
  }

  const statusFilters = [
    { value: "all", label: t("label.all") },
    { value: "pending", label: t("payment.status.pending") },
    { value: "submitted", label: t("payment.status.submitted") },
    { value: "verified", label: t("payment.status.verified") },
    { value: "rejected", label: t("payment.status.rejected") },
    { value: "refunded", label: t("payment.status.refunded") },
  ];

  return (
    <div className="admin-section">
      <AdminHeading
        kicker={t("admin.title")}
        title={t("admin.payments.title")}
        subtitle={t("admin.payments.subtitle")}
        actions={<span className="field__hint tnum">{payments.length}</span>}
      />

      <FilterLinks base={`/${locale}/admin/payments?subject=${subject}`} current={status} options={statusFilters} label={t("payment.status")} />
      <FilterLinks
        base={`/${locale}/admin/payments?status=${status}`}
        current={subject}
        options={[
          { value: "all", label: t("label.all") },
          { value: "booking", label: t("admin.payments.subject.booking") },
          { value: "subscription", label: t("admin.payments.subject.subscription") },
        ]}
        label={t("admin.payments.subject")}
      />

      <DataState locale={locale} dbReady={dbReady} isEmpty={payments.length === 0} emptyTitle="admin.payments.empty">
        <TableScroll>
          <thead>
            <tr>
              <th>{t("payment.reference")}</th>
              <th>{t("admin.payments.subject")}</th>
              <th>{t("admin.payments.amount")}</th>
              <th>{t("admin.payments.proof")}</th>
              <th>{t("payment.status")}</th>
              <th>{t("admin.audit.when")}</th>
              <th>{t("admin.actions.action")}</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={payment.id}>
                <td className="tnum" translate="no">
                  {payment.referenceCode}
                  {payment.bookingCode ? (
                    <div className="field__hint">
                      <Link href={`/${locale}/admin/bookings/${payment.bookingId}`}>{payment.bookingCode}</Link>
                    </div>
                  ) : null}
                </td>
                <td>{t(`admin.payments.subject.${payment.subjectType}` as DictKey)}</td>
                <td>
                  <Money value={payment.amount} locale={locale} />
                </td>
                <td>
                  {payment.proofCount === 0 ? (
                    <span className="muted">{t("payment.manualNotice")}</span>
                  ) : (
                    <span className="tnum">{payment.proofCount}</span>
                  )}
                </td>
                <td>
                  <PaymentStatus locale={locale} status={payment.status} />
                  {payment.customerReference ? (
                    <div className="field__hint" translate="no">
                      {payment.customerReference}
                    </div>
                  ) : null}
                </td>
                <td className="tnum">{formatDateTime(payment.createdAt, locale)}</td>
                <td>
                  <div className="admin-actions">
                    {perms.has("payment.verify") && payment.status !== "verified" && payment.status !== "refunded" ? (
                      <ActionButton
                        locale={locale}
                        endpoint="/api/admin/payments"
                        payload={{ action: "verify", paymentId: payment.id }}
                        label={t("admin.payments.verify")}
                        variant="primary"
                        reasonLabel={t("admin.payments.customerReference")}
                        successText={t("admin.actions.done")}
                      />
                    ) : null}
                    {perms.has("payment.verify") && (payment.status === "submitted" || payment.status === "pending") ? (
                      <ActionButton
                        locale={locale}
                        endpoint="/api/admin/payments"
                        payload={{ action: "reject", paymentId: payment.id }}
                        label={t("admin.payments.reject")}
                        variant="danger"
                        reasonLabel={t("admin.payments.rejectReason")}
                        reasonRequired
                      />
                    ) : null}
                    {perms.has("payment.refund") && payment.status === "verified" ? (
                      <ActionButton
                        locale={locale}
                        endpoint="/api/admin/payments"
                        payload={{ action: "refund", paymentId: payment.id }}
                        label={t("admin.payments.markRefunded")}
                        variant="danger"
                        reasonLabel={t("admin.payments.rejectReason")}
                        reasonRequired
                      />
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </TableScroll>
      </DataState>

      <p className="field__hint">{t("payment.manualNotice")}</p>
      {perms.has("payment.read") ? (
        <div className="card stack-xs">
          <strong>{t("admin.payments.proof")}</strong>
          <p className="soft">{t("legal.privacy.s3.body")}</p>
          {payments.some((payment) => payment.proofCount > 0) ? (
            <p className="field__hint">{t("admin.payments.proofExternal")}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
