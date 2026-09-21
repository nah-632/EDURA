"use client";

/**
 * Review form (§19).
 *
 * Shown only for a completed booking the customer owns, and only when no review
 * exists - the server enforces both, this just does not offer what the server
 * would refuse. The three optional category scores are sent as a nested object,
 * which is why this is a purpose-built form rather than the generic one.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

import { createTranslator, type Locale } from "@/lib/i18n";
import { errorKeyFor } from "@/lib/i18n/api-errors";

export function ReviewForm({ locale, bookingId }: { locale: Locale; bookingId: string }) {
  const t = createTranslator(locale);
  const router = useRouter();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [categories, setCategories] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const categoryKeys = ["clarity", "punctuality", "communication"] as const;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId,
          rating,
          comment: comment.trim() || null,
          categories: Object.keys(categories).length > 0 ? categories : undefined,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; status?: string };
      if (!res.ok || !body.ok) {
        setError(t(errorKeyFor(body.error)));
        return;
      }
      setDone(body.status === "published" ? t("review.submitted") : t("review.pendingModeration"));
      router.refresh();
    } catch {
      setError(t("error.network"));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="card stack-xs">
        <strong>{t("review.title")}</strong>
        <p className="soft" role="status" aria-live="polite">
          {done}
        </p>
        {done === t("review.pendingModeration") ? <p className="field__hint">{t("admin.reviews.subtitle")}</p> : null}
      </div>
    );
  }

  return (
    <form className="card stack-sm" onSubmit={onSubmit}>
      <h2 style={{ fontSize: "1.05rem" }}>{t("review.title")}</h2>
      <p className="field__hint">{t("review.subtitle")}</p>

      <fieldset className="stack-xs" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label">{t("review.rating")}</legend>
        <div className="row" style={{ gap: "0.35rem" }}>
          {[5, 4, 3, 2, 1].map((value) => (
            <button
              key={value}
              type="button"
              className={rating === value ? "chip chip--pale" : "chip"}
              aria-pressed={rating === value}
              onClick={() => setRating(value)}
            >
              <span className="tnum">{value}</span> · {t(`review.rating.${value}` as never)}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="field">
        <span className="label">{t("review.comment")}</span>
        <textarea
          className="textarea"
          rows={4}
          maxLength={1500}
          value={comment}
          placeholder={t("review.commentPlaceholder")}
          onChange={(event) => setComment(event.target.value)}
        />
      </label>

      <fieldset className="stack-xs" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label">{t("review.categories.clarity")}</legend>
        {categoryKeys.map((key) => (
          <label className="field" key={key}>
            <span className="field__hint">{t(`review.categories.${key}` as never)}</span>
            <select
              className="select"
              value={categories[key] ?? ""}
              onChange={(event) =>
                setCategories((prev) => {
                  const next = { ...prev };
                  if (event.target.value === "") delete next[key];
                  else next[key] = Number(event.target.value);
                  return next;
                })
              }
            >
              <option value="">—</option>
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        ))}
      </fieldset>

      <div className="row" style={{ gap: "0.5rem" }}>
        <button className="btn btn--primary btn--sm" type="submit" disabled={busy} aria-busy={busy}>
          {busy ? t("state.saving") : t("review.submit")}
        </button>
        <span role="status" aria-live="polite" className="field__hint" style={{ color: "var(--danger)" }}>
          {error ?? ""}
        </span>
      </div>
    </form>
  );
}
