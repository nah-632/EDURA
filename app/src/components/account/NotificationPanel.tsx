"use client";

/**
 * Notification inbox (§17).
 *
 * Rendering happens at read time from the notification's type and parameters,
 * so switching language re-renders the same rows in the other language rather
 * than showing a message frozen in the language it was created in.
 */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { EmptyState } from "@/components/ui/EmptyState";
import { createTranslator, formatDateTime, type Locale } from "@/lib/i18n";
import { errorKeyFor } from "@/lib/i18n/api-errors";

export interface NotificationItem {
  id: string;
  type: string;
  readAt: string | null;
  createdAt: string;
  title: string;
  body: string;
  href: string | null;
}

export function NotificationPanel({
  locale,
  items,
  unread,
}: {
  locale: Locale;
  items: NotificationItem[];
  unread: number;
}) {
  const t = createTranslator(locale);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function markRead(ids: string[] | "all") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/me/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_read", ids }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(t(errorKeyFor(body.error)));
        return;
      }
      router.refresh();
    } catch {
      setError(t("error.network"));
    } finally {
      setBusy(false);
    }
  }

  if (items.length === 0) {
    return (
      <EmptyState tone="plain" title={t("state.emptyTitle")} body={t("notifications.empty")} />
    );
  }

  return (
    <div className="admin-section">
      <div className="admin-toolbar">
        <span className="field__hint">
          {t("notifications.unread")}: <span className="tnum">{unread}</span>
        </span>
        <button className="btn btn--outline btn--sm" type="button" disabled={busy || unread === 0} onClick={() => void markRead("all")}>
          {t("cta.markAllRead")}
        </button>
        <span role="status" aria-live="polite" className="field__hint" style={{ color: "var(--danger)" }}>
          {error ?? ""}
        </span>
      </div>

      <ul className="admin-list">
        {items.map((item) => (
          <li key={item.id} className="card stack-xs" style={{ opacity: item.readAt ? 0.72 : 1 }}>
            <div className="row--between" style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
              <strong>{item.title}</strong>
              <time className="field__hint tnum" dateTime={item.createdAt}>
                {formatDateTime(item.createdAt, locale)}
              </time>
            </div>
            {item.body ? <p className="soft">{item.body}</p> : null}
            <div className="admin-actions">
              {item.href ? (
                <Link className="btn btn--outline btn--sm" href={item.href}>
                  {t("cta.learnMore")}
                </Link>
              ) : null}
              {!item.readAt ? (
                <button className="btn btn--quiet btn--sm" type="button" disabled={busy} onClick={() => void markRead([item.id])}>
                  {t("notifications.markRead")}
                </button>
              ) : (
                <span className="field__hint">{t("notifications.markRead")}: ✓</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
