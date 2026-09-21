"use client";

/**
 * Student records manager (§7.1, §22).
 *
 * Client-side because add/edit/delete are all inline on one screen, and a
 * customer managing three children should not have to open a form per row. The
 * data it starts from is server-rendered; after a change it refreshes the route
 * so the page remains the single source of truth.
 *
 * The API is scoped by session, so nothing here sends an owner id.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

import { createTranslator, type Locale } from "@/lib/i18n";
import { errorKeyFor } from "@/lib/i18n/api-errors";

export interface StudentRow {
  id: string;
  fullName: string;
  stageId: string | null;
  stageName: string | null;
  grade: string | null;
  gender: string | null;
  birthYear: number | null;
  notes: string | null;
}

export function StudentManager({
  locale,
  students,
  stages,
  currentYear,
}: {
  locale: Locale;
  students: StudentRow[];
  stages: { id: string; name: string }[];
  currentYear: number;
}) {
  const t = createTranslator(locale);
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(action: "create" | "update" | "delete", form?: HTMLFormElement, id?: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      let payload: Record<string, unknown>;
      if (action === "delete") {
        payload = { action, id };
      } else {
        const data = new FormData(form!);
        payload = {
          action,
          ...(id ? { id } : {}),
          student: {
            fullName: String(data.get("fullName") ?? "").trim(),
            stageId: String(data.get("stageId") ?? "") || null,
            grade: String(data.get("grade") ?? "").trim() || null,
            gender: String(data.get("gender") ?? "") || null,
            birthYear: data.get("birthYear") ? Number(data.get("birthYear")) : null,
            notes: String(data.get("notes") ?? "").trim() || null,
          },
        };
      }
      const res = await fetch("/api/me/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(t(errorKeyFor(body.error)));
        return;
      }
      setMessage(action === "delete" ? t("students.deleted") : t("students.saved"));
      setEditing(null);
      router.refresh();
    } catch {
      setError(t("error.network"));
    } finally {
      setBusy(false);
    }
  }

  function fields(student?: StudentRow) {
    return (
      <>
        <label className="field">
          <span className="label">{t("booking.student.name")}</span>
          <input className="input" name="fullName" defaultValue={student?.fullName ?? ""} required maxLength={120} />
        </label>
        <label className="field">
          <span className="label">{t("booking.student.stage")}</span>
          <select className="select" name="stageId" defaultValue={student?.stageId ?? ""}>
            <option value="">—</option>
            {stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="label">{t("booking.student.grade")}</span>
          <input className="input" name="grade" defaultValue={student?.grade ?? ""} maxLength={40} />
        </label>
        <label className="field">
          <span className="label">{t("booking.student.gender")}</span>
          <select className="select" name="gender" defaultValue={student?.gender ?? ""}>
            <option value="">—</option>
            <option value="male">{t("booking.student.gender.male")}</option>
            <option value="female">{t("booking.student.gender.female")}</option>
          </select>
        </label>
        <label className="field">
          <span className="label">{t("booking.student.birthYear")}</span>
          <input
            className="input"
            type="number"
            name="birthYear"
            min={1990}
            max={currentYear}
            defaultValue={student?.birthYear ?? ""}
            dir="ltr"
          />
        </label>
        <label className="field">
          <span className="label">{t("label.notes")}</span>
          <textarea className="textarea" name="notes" rows={2} maxLength={600} defaultValue={student?.notes ?? ""} />
        </label>
      </>
    );
  }

  return (
    <div className="admin-section">
      <p className="notice notice--info">{t("students.minorNote")}</p>
      {message ? (
        <p className="field__hint" role="status" aria-live="polite" style={{ color: "var(--ok)" }}>
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="field__hint" role="status" aria-live="polite" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      ) : null}

      <form
        className="card stack-sm"
        onSubmit={(event) => {
          event.preventDefault();
          void submit("create", event.currentTarget);
        }}
      >
        <h2 style={{ fontSize: "1.05rem" }}>{t("students.add")}</h2>
        {fields()}
        <button className="btn btn--primary btn--sm" type="submit" disabled={busy} aria-busy={busy}>
          {busy ? t("state.saving") : t("students.add")}
        </button>
      </form>

      {students.length === 0 ? (
        <div className="card stack-xs">
          <strong>{t("students.empty")}</strong>
          <p className="soft">{t("students.emptyBody")}</p>
        </div>
      ) : (
        <ul className="admin-list">
          {students.map((student) => (
            <li key={student.id} className="card stack-xs">
              <div className="row--between" style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
                <strong>{student.fullName}</strong>
                <span className="admin-meta">
                  {student.stageName ? <span>{student.stageName}</span> : null}
                  {student.grade ? <span>{student.grade}</span> : null}
                  {student.gender ? (
                    <span>{student.gender === "male" ? t("booking.student.gender.male") : t("booking.student.gender.female")}</span>
                  ) : null}
                </span>
              </div>
              {student.notes ? <p className="soft">{student.notes}</p> : null}

              <div className="admin-actions">
                <button
                  className="btn btn--outline btn--sm"
                  type="button"
                  onClick={() => setEditing(editing === student.id ? null : student.id)}
                  aria-expanded={editing === student.id}
                >
                  {editing === student.id ? t("cta.close") : t("students.edit")}
                </button>
                <button
                  className="btn btn--danger btn--sm"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(t("students.deleteConfirm"))) void submit("delete", undefined, student.id);
                  }}
                >
                  {t("cta.cancel")}
                </button>
              </div>

              {editing === student.id ? (
                <form
                  className="stack-sm"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void submit("update", event.currentTarget, student.id);
                  }}
                >
                  {fields(student)}
                  <button className="btn btn--primary btn--sm" type="submit" disabled={busy}>
                    {busy ? t("state.saving") : t("cta.save")}
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <p className="field__hint">{t("students.deleteConfirm")}</p>
    </div>
  );
}
