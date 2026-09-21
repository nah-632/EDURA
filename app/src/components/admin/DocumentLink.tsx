"use client";

/**
 * Tutor-document opener (§21).
 *
 * The link is not a URL to the document: clicking fetches a five-minute signed
 * URL from an endpoint that writes an audit row first. So the console cannot
 * display a permanent link to a tutor's ID document, and every read is
 * attributable to the admin who performed it.
 */
import { useState } from "react";

import { createTranslator, type Locale } from "@/lib/i18n";
import { errorKeyFor } from "@/lib/i18n/api-errors";

export function DocumentLink({
  locale,
  documentId,
  label,
  onOpened,
  endpoint = "documents",
}: {
  locale: Locale;
  documentId: string;
  label: string;
  onOpened?: string;
  /** "documents" for tutor documents, "payment-proofs" for payment proofs */
  endpoint?: "documents" | "payment-proofs";
}) {
  const t = createTranslator(locale);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/${endpoint}/${documentId}`, { method: "GET" });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; url?: string };
      if (!res.ok || !body.ok || !body.url) {
        setError(t(errorKeyFor(body.error)));
        return;
      }
      setOpened(true);
      // A signed URL is short-lived and single-purpose: opening it in a new
      // tab keeps the operator's console state intact.
      window.open(body.url, "_blank", "noopener,noreferrer");
    } catch {
      setError(t("error.network"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="stack-xs" style={{ display: "inline-flex", flexDirection: "column", gap: "0.2rem" }}>
      <button className="btn btn--outline btn--sm" type="button" onClick={() => void open()} disabled={busy} aria-busy={busy}>
        {busy ? t("label.loadingShort") : label}
      </button>
      <span role="status" aria-live="polite" className="field__hint" style={{ color: error ? "var(--danger)" : "var(--ink-mute)" }}>
        {error ?? (opened ? (onOpened ?? t("admin.tutors.documentLogged")) : "")}
      </span>
    </span>
  );
}
