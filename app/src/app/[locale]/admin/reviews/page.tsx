import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminDenied } from "@/components/admin/AdminShell";
import { ActionButton } from "@/components/forms/ActionButton";
import { AdminHeading, DataState, FilterLinks, ReviewStatus, TableScroll } from "@/components/admin/ui";
import { adminGate } from "@/lib/admin/guard";
import { listReviewsAdmin } from "@/lib/admin/queries";
import { createTranslator, formatDateTime, resolveLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * /[locale]/admin/reviews (§19).
 *
 * Publishing recomputes the tutor's rating from published rows only, so hiding
 * a review removes its effect immediately - the number a customer sees on a
 * profile always has a visible explanation.
 */
export default async function AdminReviewsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = resolveLocale(rawLocale);
  const gate = await adminGate("review.read");
  if (!gate.ok) {
    if (gate.reason === "unauthenticated") redirect(`/${locale}/admin/login`);
    return <AdminDenied locale={locale} reason="forbidden" />;
  }

  const query = await searchParams;
  const status = query.status ?? "all";
  const t = createTranslator(locale);
  const perms = gate.ctx.session.permissions;
  const { dbReady, data: reviews } = await listReviewsAdmin({ status, limit: 120 });

  return (
    <div className="admin-section">
      <AdminHeading
        kicker={t("admin.title")}
        title={t("admin.reviews.title")}
        subtitle={t("admin.reviews.subtitle")}
        actions={<span className="field__hint tnum">{reviews.length}</span>}
      />

      <FilterLinks
        base={`/${locale}/admin/reviews`}
        current={status}
        options={[
          { value: "all", label: t("label.all") },
          { value: "pending", label: t("admin.reviews.status.pending") },
          { value: "published", label: t("admin.reviews.status.published") },
          { value: "reported", label: t("admin.reviews.status.reported") },
          { value: "hidden", label: t("admin.reviews.status.hidden") },
        ]}
        label={t("label.status")}
      />

      <DataState locale={locale} dbReady={dbReady} isEmpty={reviews.length === 0} emptyTitle="admin.reviews.empty">
        <TableScroll>
          <thead>
            <tr>
              <th>{t("review.rating")}</th>
              <th>{t("review.comment")}</th>
              <th>{t("admin.nav.tutors")}</th>
              <th>{t("booking.idLabel")}</th>
              <th>{t("label.status")}</th>
              <th>{t("admin.audit.when")}</th>
              <th>{t("admin.actions.action")}</th>
            </tr>
          </thead>
          <tbody>
            {reviews.map((review) => (
              <tr key={review.id}>
                <td className="tnum">{t("admin.reviews.ratingValue", { rating: review.rating })}</td>
                <td style={{ whiteSpace: "normal", maxWidth: "28rem" }}>{review.comment ?? "—"}</td>
                <td>
                  <Link href={`/${locale}/admin/tutors/${review.tutorId}`}>{review.tutorName ?? "—"}</Link>
                </td>
                <td className="tnum">{review.bookingCode ?? "—"}</td>
                <td>
                  <ReviewStatus locale={locale} status={review.status} />
                </td>
                <td className="tnum">{formatDateTime(review.createdAt, locale)}</td>
                <td>
                  {perms.has("review.moderate") ? (
                    <div className="admin-actions">
                      {review.status !== "published" ? (
                        <ActionButton
                          locale={locale}
                          endpoint="/api/admin/reviews"
                          payload={{ reviewId: review.id, action: "publish" }}
                          label={t("admin.reviews.publish")}
                          variant="primary"
                        />
                      ) : null}
                      {review.status !== "hidden" ? (
                        <ActionButton
                          locale={locale}
                          endpoint="/api/admin/reviews"
                          payload={{ reviewId: review.id, action: "hide" }}
                          label={t("admin.reviews.hide")}
                          variant="danger"
                          reasonLabel={t("admin.reviews.note")}
                          reasonRequired
                        />
                      ) : (
                        <ActionButton
                          locale={locale}
                          endpoint="/api/admin/reviews"
                          payload={{ reviewId: review.id, action: "restore" }}
                          label={t("admin.reviews.restore")}
                          variant="outline"
                        />
                      )}
                    </div>
                  ) : (
                    <span className="field__hint">{t("state.forbidden")}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </TableScroll>
      </DataState>

      <p className="field__hint">{t("admin.reviews.affectsRating")}</p>
    </div>
  );
}
