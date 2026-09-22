"use client";

/**
 * Booking entry panel on the tutor profile.
 *
 * Product surface: calm type, no display serif, no parallax. The price shown
 * here is computed by the SAME pure pricing module the server uses, so the
 * number the visitor sees cannot disagree with the number the booking is
 * created with.
 */
import { useMemo, useState } from "react";

import { formatMoney, type Locale } from "@/lib/i18n";
import { priceBreakdown } from "@/lib/booking/pricing";

export interface BookingPanelEntryProps {
  locale: Locale;
  tutor: {
    id: string;
    slug: string;
    name: string;
    pricePerHour: string;
    teachesHome: boolean;
    teachesOnline: boolean;
  };
  subjects: { id: string; code: string; name: string }[];
  labels: {
    title: string;
    price: string;
    perHour: string;
    home: string;
    online: string;
    book: string;
    note: string;
    duration: string;
    /** Shown under the duration field; passed by the tutor profile page. */
    durationNote: string;
    subject: string;
    methodLabel: string;
    total: string;
    minutes: string;
  };
  money: { hourly: string };
}

const DURATIONS = [60, 90, 120] as const;

export function BookingPanelEntry({ locale, tutor, subjects, labels, money }: BookingPanelEntryProps) {
  const [subject, setSubject] = useState(subjects[0]?.code ?? "");
  const [duration, setDuration] = useState<number>(60);
  const [method, setMethod] = useState<"home" | "online">(tutor.teachesOnline ? "online" : "home");

  // The lesson-type multiplier is 1.000 in v1 (standard private lesson); the
  // stepper applies the real multiplier once a lesson type is chosen.
  const total = useMemo(() => {
    try {
      return priceBreakdown(tutor.pricePerHour, duration, "1.000").total;
    } catch {
      return money.hourly;
    }
  }, [tutor.pricePerHour, duration, money.hourly]);

  const href = `/${locale}/tutors/${tutor.slug}/book?subject=${encodeURIComponent(subject)}&duration=${duration}&method=${method}`;

  return (
    <div className="panel booking-entry">
      <div className="panel__head">
        <strong>{labels.title}</strong>
      </div>
      <div className="panel__body stack-sm">
        <div className="price-block">
          <span className="price-block__value">{formatMoney(tutor.pricePerHour, locale)}</span>
          <span className="price-block__unit">{labels.perHour}</span>
        </div>

        <div className="field">
          <label className="label" htmlFor="bk-subject">
            {labels.subject}
          </label>
          <select id="bk-subject" className="select" value={subject} onChange={(e) => setSubject(e.target.value)}>
            {subjects.map((s) => (
              <option key={s.id} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <span className="label">{labels.duration}</span>
          <div className="row" style={{ gap: "0.4rem" }}>
            {DURATIONS.map((value) => (
              <button
                key={value}
                type="button"
                className={`chip ${duration === value ? "chip--pale" : ""}`}
                aria-pressed={duration === value}
                onClick={() => setDuration(value)}
                style={{ cursor: "pointer" }}
              >
                {value} {labels.minutes}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="label">{labels.methodLabel}</span>
          <div className="row" style={{ gap: "0.4rem" }}>
            {tutor.teachesHome ? (
              <button
                type="button"
                className={`chip ${method === "home" ? "chip--pale" : ""}`}
                aria-pressed={method === "home"}
                onClick={() => setMethod("home")}
                style={{ cursor: "pointer" }}
              >
                {labels.home}
              </button>
            ) : null}
            {tutor.teachesOnline ? (
              <button
                type="button"
                className={`chip ${method === "online" ? "chip--pale" : ""}`}
                aria-pressed={method === "online"}
                onClick={() => setMethod("online")}
                style={{ cursor: "pointer" }}
              >
                {labels.online}
              </button>
            ) : null}
          </div>
        </div>

        <div className="price-total">
          <span>{labels.total}</span>
          <strong className="tnum">{formatMoney(total, locale)}</strong>
        </div>

        <a className="btn btn--primary btn--lg" href={href}>
          {labels.book}
        </a>
        <p className="field__hint">{labels.note}</p>
        <p className="field__hint">{labels.durationNote}</p>
      </div>
    </div>
  );
}
