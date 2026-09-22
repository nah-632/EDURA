"use client";

/**
 * Booking stepper - product surface.
 *
 * Five visible steps (المدرس → الطالب → الحصة → الموعد → التأكيد), a progress
 * bar that states position in words as well as visually, and a price that is
 * computed with the same pure pricing module the server uses.
 *
 * The timeline is enforced on the server too: this UI can be bypassed entirely
 * and the API will still validate availability, ownership and money.
 */
import { useMemo, useState } from "react";

import { formatMoney, type Locale } from "@/lib/i18n";
import { priceBreakdown } from "@/lib/booking/pricing";
import { availableSlots, type AvailabilityWindow } from "@/lib/booking/availability";

export interface BookingStepperProps {
  locale: Locale;
  tutor: {
    id: string;
    slug: string;
    name: string;
    pricePerHour: string;
    teachesHome: boolean;
    teachesOnline: boolean;
  };
  windows: AvailabilityWindow[];
  signedIn: boolean;
  initial: { subject: string; duration: number; method: "home" | "online" };
  /**
   * Label keys read as VALUES (`.split("|")`) and not merely rendered. Under
   * `noUncheckedIndexedAccess` an index access is `string | undefined`, so the
   * keys that must be real strings are declared required here — which is what
   * the callers already provide.
   */
  labels: Record<string, string> & { stages: string; subjects: string };
}

interface Student {
  id: string;
  fullName: string;
  stage: string;
  grade: string;
  notes: string;
}

const STEPS = ["tutor", "student", "lesson", "schedule", "confirm"] as const;
type Step = (typeof STEPS)[number];

export function BookingStepper({ locale, tutor, windows, signedIn, initial, labels }: BookingStepperProps) {
  const [step, setStep] = useState<Step>(signedIn ? "student" : "student");
  const [student, setStudent] = useState<Student>({ id: "", fullName: "", stage: "", grade: "", notes: "" });
  const [subject, setSubject] = useState(initial.subject);
  const [method, setMethod] = useState<"home" | "online">(initial.method);
  const [duration, setDuration] = useState(initial.duration);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [area, setArea] = useState("");
  const [notes, setNotes] = useState("");
  const [accept, setAccept] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "error" | "created">("idle");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [result, setResult] = useState<{ code: string; amount: string; whatsappUrl: string | null } | null>(null);

  /**
   * One random token per booking attempt. It is what makes the idempotency key
   * unguessable: the readable part of the key stops a double submission, and
   * this suffix stops anyone else from constructing the same key.
   */
  const submissionKey = useMemo(() => {
    try {
      return crypto.randomUUID();
    } catch {
      return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    }
  }, []);

  const price = useMemo(() => {
    try {
      return priceBreakdown(tutor.pricePerHour, duration, "1.000");
    } catch {
      return null;
    }
  }, [tutor.pricePerHour, duration]);

  const slots = useMemo(() => {
    if (!date || windows.length === 0) return [];
    return availableSlots(date, duration, { windows, timeOff: [], busy: [] }, 30);
  }, [date, duration, windows]);

  const stepIndex = STEPS.indexOf(step);
  const progress = ((stepIndex + 1) / STEPS.length) * 100;

  async function submit() {
    setStatus("saving");
    setErrorCode(null);
    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tutorId: tutor.id,
          studentId: student.id || undefined,
          student: { fullName: student.fullName, stage: student.stage, grade: student.grade, notes: student.notes },
          subjectCode: subject,
          lessonTypeCode: "private",
          method,
          date,
          time,
          durationMinutes: duration,
          areaCode: area || undefined,
          customerNotes: notes || undefined,
          acceptTerms: accept,
          // The readable part keeps a double submission in the same session
          // idempotent; the random suffix makes the key unguessable, so it can
          // never be used to probe for somebody else's booking.
          idempotencyKey: `${tutor.id}:${date}:${time}:${duration}:${submissionKey}`,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        booking?: { code: string; amount: string; whatsappUrl: string };
      };
      if (!response.ok || !body.ok) {
        setErrorCode(body.error ?? "unexpected");
        setStatus("error");
        return;
      }
      setResult({
        code: body.booking!.code,
        amount: body.booking!.amount,
        whatsappUrl: body.booking!.whatsappUrl ?? null,
      });
      setStatus("created");
    } catch {
      setErrorCode("network");
      setStatus("error");
    }
  }

  if (status === "created" && result) {
    return (
      <div className="panel">
        <div className="panel__body stack-sm">
          <span className="status status--ok">{labels.createdTitle}</span>
          <p className="soft">{labels.createdBody}</p>
          <div className="copy-row">
            <code>{result.code}</code>
            <span className="tnum">{formatMoney(result.amount, locale)}</span>
          </div>
          <p className="field__hint">{labels.whatsappNote}</p>
          <div className="row">
            {result.whatsappUrl ? (
              <a className="btn btn--primary" href={result.whatsappUrl} target="_blank" rel="noopener noreferrer">
                {labels.openWhatsapp}
              </a>
            ) : null}
            <a className="btn btn--outline" href={`/${locale}/dashboard/bookings`}>
              {labels.viewBookings}
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="panel stepper">
      <div className="stepper__bar" role="group" aria-label={labels.progress}>
        <div className="stepper__track">
          <span style={{ "--progress": progress / 100 } as React.CSSProperties} />
        </div>
        <ol className="stepper__steps">
          {STEPS.map((s, i) => (
            <li key={s} aria-current={s === step ? "step" : undefined} data-done={i < stepIndex}>
              <span className="stepper__dot" aria-hidden="true">
                {i + 1}
              </span>
              {labels[s]}
            </li>
          ))}
        </ol>
      </div>

      <div className="panel__body stack">
        {step === "student" ? (
          <div className="stack-sm">
            <h2 style={{ fontSize: "1.15rem" }}>{labels.studentTitle}</h2>
            <div className="field">
              <label className="label" htmlFor="st-name">
                {labels.studentName}
              </label>
              <input
                id="st-name"
                className="input"
                value={student.fullName}
                onChange={(e) => setStudent({ ...student, fullName: e.target.value })}
                placeholder={labels.studentNamePlaceholder}
                autoComplete="name"
              />
            </div>
            <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div className="field">
                <label className="label" htmlFor="st-stage">
                  {labels.studentStage}
                </label>
                <select
                  id="st-stage"
                  className="select"
                  value={student.stage}
                  onChange={(e) => setStudent({ ...student, stage: e.target.value })}
                >
                  <option value="">{labels.choose}</option>
                  {labels.stages.split("|").map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="label" htmlFor="st-grade">
                  {labels.studentGrade}
                </label>
                <input
                  id="st-grade"
                  className="input"
                  value={student.grade}
                  onChange={(e) => setStudent({ ...student, grade: e.target.value })}
                />
              </div>
            </div>
            <div className="field">
              <label className="label" htmlFor="st-notes">
                {labels.studentNotes}
              </label>
              <textarea
                id="st-notes"
                className="textarea"
                value={student.notes}
                onChange={(e) => setStudent({ ...student, notes: e.target.value })}
                placeholder={labels.studentNotesHelp}
              />
            </div>
            <p className="notice notice--info">{labels.minorNotice}</p>
          </div>
        ) : null}

        {step === "lesson" ? (
          <div className="stack-sm">
            <h2 style={{ fontSize: "1.15rem" }}>{labels.lessonTitle}</h2>
            <div className="field">
              <label className="label" htmlFor="ls-subject">
                {labels.subject}
              </label>
              <select id="ls-subject" className="select" value={subject} onChange={(e) => setSubject(e.target.value)}>
                {labels.subjects.split("|").map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <span className="label">{labels.method}</span>
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
            {method === "home" ? (
              <div className="stack-xs">
                <div className="field">
                  <label className="label" htmlFor="ls-area">
                    {labels.area}
                  </label>
                  <input id="ls-area" className="input" value={area} onChange={(e) => setArea(e.target.value)} />
                </div>
                <p className="field__hint">{labels.homeHelp}</p>
              </div>
            ) : null}
            <div className="field">
              <label className="label" htmlFor="ls-duration">
                {labels.duration}
              </label>
              <select
                id="ls-duration"
                className="select"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              >
                {[30, 45, 60, 90, 120].map((value) => (
                  <option key={value} value={value}>
                    {value} {labels.minutes}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}

        {step === "schedule" ? (
          <div className="stack-sm">
            <h2 style={{ fontSize: "1.15rem" }}>{labels.scheduleTitle}</h2>
            <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div className="field">
                <label className="label" htmlFor="sc-date">
                  {labels.date}
                </label>
                <input
                  id="sc-date"
                  type="date"
                  className="input"
                  value={date}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setTime("");
                  }}
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="sc-time">
                  {labels.time}
                </label>
                <select
                  id="sc-time"
                  className="select"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  disabled={!date}
                >
                  <option value="">{labels.choose}</option>
                  {slots.map((slot) => (
                    <option key={slot} value={slot}>
                      {slot}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="field__hint">{labels.availabilityHint}</p>
            {date && slots.length === 0 ? <p className="notice notice--warn">{labels.noSlots}</p> : null}
          </div>
        ) : null}

        {step === "confirm" ? (
          <div className="stack-sm">
            <h2 style={{ fontSize: "1.15rem" }}>{labels.confirmTitle}</h2>
            <dl className="summary">
              <div>
                <dt>{labels.tutorLabel}</dt>
                <dd>{tutor.name}</dd>
              </div>
              <div>
                <dt>{labels.studentLabel}</dt>
                <dd>{student.fullName || "—"}</dd>
              </div>
              <div>
                <dt>{labels.subject}</dt>
                <dd>{subject}</dd>
              </div>
              <div>
                <dt>{labels.method}</dt>
                <dd>{method === "home" ? labels.home : labels.online}</dd>
              </div>
              <div>
                <dt>{labels.date}</dt>
                <dd className="tnum">{date || "—"}</dd>
              </div>
              <div>
                <dt>{labels.time}</dt>
                <dd className="tnum">{time || "—"}</dd>
              </div>
              <div>
                <dt>{labels.duration}</dt>
                <dd>
                  {duration} {labels.minutes}
                </dd>
              </div>
              <div>
                <dt>{labels.total}</dt>
                <dd className="tnum">{price ? formatMoney(price.total, locale) : "—"}</dd>
              </div>
            </dl>

            <div className="field">
              <label className="label" htmlFor="cf-notes">
                {labels.notes}
              </label>
              <textarea
                id="cf-notes"
                className="textarea"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={labels.notesPlaceholder}
              />
            </div>

            <label className="check">
              <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
              <span>{labels.acceptTerms}</span>
            </label>

            {!signedIn ? <p className="notice notice--warn">{labels.signInRequired}</p> : null}
            {status === "error" ? (
              <p className="notice notice--error" role="alert">
                {labels["error_" + (errorCode ?? "unexpected")] ?? labels.errorUnexpected}
              </p>
            ) : null}

            <button
              type="button"
              className="btn btn--primary btn--lg"
              disabled={!accept || !signedIn || status === "saving"}
              onClick={submit}
            >
              {status === "saving" ? labels.submitting : labels.submit}
            </button>
            <p className="field__hint">{labels.paymentNote}</p>
          </div>
        ) : null}

        <div className="row row--between stepper__nav">
          <button
            type="button"
            className="btn btn--quiet"
            onClick={() => setStep(STEPS[Math.max(0, stepIndex - 1)]!)}
            disabled={stepIndex === 0}
          >
            {labels.back}
          </button>
          {step !== "confirm" ? (
            <button
              type="button"
              className="btn btn--outline"
              onClick={() => setStep(STEPS[Math.min(STEPS.length - 1, stepIndex + 1)]!)}
              disabled={(step === "student" && !student.fullName.trim()) || (step === "schedule" && (!date || !time))}
            >
              {labels.next}
            </button>
          ) : null}
        </div>
      </div>

      <div className="stepper__foot">
        <span>{labels.total}</span>
        <strong className="tnum">{price ? formatMoney(price.total, locale) : "—"}</strong>
      </div>
    </div>
  );
}
