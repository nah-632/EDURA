"use client";

/**
 * Availability editor (§7.2, §12, §23).
 *
 * The weekly template saved here is what the booking engine validates against -
 * the customer-facing calendar is never the source of truth. Overlapping
 * windows for the same weekday are refused client-side as a convenience AND
 * server-side because the engine's availability check would otherwise accept
 * two windows that contradict each other.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

import { createTranslator, weekdayName, type Locale } from "@/lib/i18n";
import { errorKeyFor } from "@/lib/i18n/api-errors";

interface Window {
  weekday: number;
  startTime: string;
  endTime: string;
}

export function AvailabilityEditor({
  locale,
  initial,
  timeOff,
}: {
  locale: Locale;
  initial: Window[];
  timeOff: { id: string; startsAt: string; endsAt: string; reason: string | null }[];
}) {
  const t = createTranslator(locale);
  const router = useRouter();
  const [windows, setWindows] = useState<Window[]>(initial);
  const [newOff, setNewOff] = useState({ startsAt: "", endsAt: "", reason: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function overlaps(candidate: Window): boolean {
    return windows.some(
      (window) =>
        window !== candidate &&
        window.weekday === candidate.weekday &&
        candidate.startTime < window.endTime &&
        candidate.endTime > window.startTime,
    );
  }

  async function post(payload: Record<string, unknown>, successText: string) {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(t(errorKeyFor(body.error)));
        return false;
      }
      setDone(successText);
      router.refresh();
      return true;
    } catch {
      setError(t("error.network"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    for (const window of windows) {
      if (window.endTime <= window.startTime) {
        setError(t("tutor.availability.invalidRange"));
        return;
      }
      if (overlaps(window)) {
        setError(t("tutor.availability.overlap"));
        return;
      }
    }
    await post({ action: "save_availability", windows }, t("tutor.availability.saved"));
  }

  const weekdays = [0, 1, 2, 3, 4, 5, 6];

  return (
    <div className="admin-section">
      <div className="card stack-sm">
        <h2 style={{ fontSize: "1.05rem" }}>{t("tutor.availability.title")}</h2>
        <p className="field__hint">{t("tutor.availability.help")}</p>

        {weekdays.map((weekday) => {
          const dayWindows = windows.filter((window) => window.weekday === weekday);
          return (
            <div className="avail-day" key={weekday}>
              <strong>{weekdayName(weekday, locale)}</strong>
              {dayWindows.length === 0 ? (
                <span className="field__hint">{t("state.unavailable")}</span>
              ) : (
                <ul className="admin-list">
                  {dayWindows.map((window) => (
                    <li key={`${weekday}-${window.startTime}-${window.endTime}`}>
                      <span className="row" style={{ gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
                        <input
                          className="input"
                          style={{ maxWidth: "7rem" }}
                          type="time"
                          dir="ltr"
                          value={window.startTime}
                          aria-label={t("tutor.availability.from")}
                          onChange={(event) =>
                            setWindows((prev) =>
                              prev.map((item) =>
                                item === window ? { ...item, startTime: event.target.value } : item,
                              ),
                            )
                          }
                        />
                        <span aria-hidden="true">—</span>
                        <input
                          className="input"
                          style={{ maxWidth: "7rem" }}
                          type="time"
                          dir="ltr"
                          value={window.endTime}
                          aria-label={t("tutor.availability.to")}
                          onChange={(event) =>
                            setWindows((prev) =>
                              prev.map((item) => (item === window ? { ...item, endTime: event.target.value } : item)),
                            )
                          }
                        />
                        <button
                          className="btn btn--quiet btn--sm"
                          type="button"
                          onClick={() => setWindows((prev) => prev.filter((item) => item !== window))}
                        >
                          {t("tutor.availability.remove")}
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <button
                className="btn btn--outline btn--sm"
                type="button"
                onClick={() =>
                  setWindows((prev) => [...prev, { weekday, startTime: "16:00", endTime: "20:00" }])
                }
              >
                {t("tutor.availability.add")}
              </button>
            </div>
          );
        })}

        <div className="row" style={{ gap: "0.5rem" }}>
          <button className="btn btn--primary btn--sm" type="button" disabled={busy} aria-busy={busy} onClick={() => void save()}>
            {busy ? t("state.saving") : t("cta.save")}
          </button>
          <span role="status" aria-live="polite" className="field__hint" style={{ color: error ? "var(--danger)" : "var(--ok)" }}>
            {error ?? done ?? ""}
          </span>
        </div>
      </div>

      <div className="card stack-sm">
        <h2 style={{ fontSize: "1.05rem" }}>{t("tutor.availability.timeOff")}</h2>
        {timeOff.length === 0 ? (
          <p className="soft">{t("tutor.availability.empty")}</p>
        ) : (
          <ul className="admin-list">
            {timeOff.map((entry) => (
              <li key={entry.id}>
                <span className="tnum" translate="no">
                  {entry.startsAt} → {entry.endsAt}
                </span>
                <span className="admin-meta">
                  {entry.reason ? <span>{entry.reason}</span> : null}
                  <button
                    className="btn btn--quiet btn--sm"
                    type="button"
                    disabled={busy}
                    onClick={() => void post({ action: "remove_time_off", id: entry.id }, t("tutor.availability.saved"))}
                  >
                    {t("tutor.availability.remove")}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="grid grid--2">
          <label className="field">
            <span className="label">{t("tutor.availability.from")}</span>
            <input
              className="input"
              type="datetime-local"
              dir="ltr"
              value={newOff.startsAt}
              onChange={(event) => setNewOff({ ...newOff, startsAt: event.target.value })}
            />
          </label>
          <label className="field">
            <span className="label">{t("tutor.availability.to")}</span>
            <input
              className="input"
              type="datetime-local"
              dir="ltr"
              value={newOff.endsAt}
              onChange={(event) => setNewOff({ ...newOff, endsAt: event.target.value })}
            />
          </label>
        </div>
        <label className="field">
          <span className="label">{t("tutor.availability.timeOffReason")}</span>
          <input
            className="input"
            value={newOff.reason}
            maxLength={300}
            onChange={(event) => setNewOff({ ...newOff, reason: event.target.value })}
          />
        </label>
        <button
          className="btn btn--outline btn--sm"
          type="button"
          disabled={busy || !newOff.startsAt || !newOff.endsAt}
          onClick={() =>
            void post(
              {
                action: "add_time_off",
                // The input is local Bahrain time; the API expects an instant.
                startsAt: `${newOff.startsAt}:00+03:00`,
                endsAt: `${newOff.endsAt}:00+03:00`,
                reason: newOff.reason || null,
              },
              t("tutor.availability.saved"),
            )
          }
        >
          {t("tutor.availability.timeOffAdd")}
        </button>
      </div>
    </div>
  );
}
