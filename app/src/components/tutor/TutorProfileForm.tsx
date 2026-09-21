"use client";

/**
 * Tutor profile form (§7.2, §8).
 *
 * A purpose-built form rather than the generic one, because a tutor profile is
 * a set of SETS (subjects, stages, areas handled, languages) plus two mutually
 * dependent method flags. The server validates all of it again with
 * `tutorProfileSchema` - this component only makes the same rules visible.
 *
 * A rejected profile that is saved here goes back to `pending`: the server does
 * that, and the copy says so, so nobody expects a silent republish.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

import { createTranslator, type Locale } from "@/lib/i18n";
import { errorKeyFor } from "@/lib/i18n/api-errors";

export interface TutorProfileValues {
  headlineAr: string;
  headlineEn: string;
  bioAr: string;
  bioEn: string;
  qualification: string;
  university: string;
  major: string;
  graduationYear: number | null;
  yearsExperience: number;
  pricePerHour: string;
  teachesHome: boolean;
  teachesOnline: boolean;
  gender: string | null;
  areaId: string | null;
  areaIds: string[];
  subjectIds: string[];
  stageIds: string[];
  languages: string[];
}

interface Option {
  id: string;
  name: string;
}

export function TutorProfileForm({
  locale,
  values,
  subjects,
  stages,
  areas,
  status,
}: {
  locale: Locale;
  values: TutorProfileValues;
  subjects: Option[];
  stages: Option[];
  areas: Option[];
  status: string;
}) {
  const t = createTranslator(locale);
  const router = useRouter();
  const [state, setState] = useState<TutorProfileValues>(values);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function toggle(key: "subjectIds" | "stageIds" | "areaIds" | "languages", id: string) {
    setState((prev) => {
      const current = prev[key];
      const next = current.includes(id) ? current.filter((value) => value !== id) : [...current, id];
      return { ...prev, [key]: next };
    });
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_profile",
          profile: {
            headlineAr: state.headlineAr,
            headlineEn: state.headlineEn,
            bioAr: state.bioAr,
            bioEn: state.bioEn,
            qualification: state.qualification,
            university: state.university || null,
            major: state.major || null,
            graduationYear: state.graduationYear,
            yearsExperience: state.yearsExperience,
            pricePerHour: state.pricePerHour,
            teachesHome: state.teachesHome,
            teachesOnline: state.teachesOnline,
            gender: state.gender || null,
            areaId: state.areaId || state.areaIds[0] || null,
            areaIds: state.areaIds,
            subjectIds: state.subjectIds,
            stageIds: state.stageIds,
            languages: state.languages,
          },
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; status?: string };
      if (!res.ok || !body.ok) {
        setError(t(errorKeyFor(body.error)));
        return;
      }
      setDone(body.status === "pending" && status === "rejected" ? t("tutor.form.submitted") : t("tutor.form.saved"));
      router.refresh();
    } catch {
      setError(t("error.network"));
    } finally {
      setBusy(false);
    }
  }

  const chipGroup = (
    key: "subjectIds" | "stageIds" | "areaIds",
    label: string,
    help: string | null,
    options: Option[],
  ) => (
    <fieldset className="stack-xs" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="label">{label}</legend>
      {help ? <span className="field__hint">{help}</span> : null}
      <div className="row" style={{ gap: "0.35rem", flexWrap: "wrap" }}>
        {options.map((option) => {
          const selected = state[key].includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              className={selected ? "chip chip--pale" : "chip"}
              aria-pressed={selected}
              onClick={() => toggle(key, option.id)}
            >
              {option.name}
            </button>
          );
        })}
      </div>
    </fieldset>
  );

  return (
    <form className="admin-section" onSubmit={onSubmit}>
      <div className="card stack-sm">
        <h2 style={{ fontSize: "1.05rem" }}>{t("tutor.form.section.personal")}</h2>
        <div className="grid grid--2">
          <label className="field">
            <span className="label">{t("tutor.form.headline")}</span>
            <input
              className="input"
              value={state.headlineAr}
              onChange={(event) => setState({ ...state, headlineAr: event.target.value })}
              maxLength={140}
              required
            />
            <span className="field__hint">{t("tutor.form.headlineHelp")}</span>
          </label>
          <label className="field">
            <span className="label">{t("tutor.form.headline")} (EN)</span>
            <input
              className="input"
              dir="ltr"
              value={state.headlineEn}
              onChange={(event) => setState({ ...state, headlineEn: event.target.value })}
              maxLength={140}
              required
            />
          </label>
        </div>
        <div className="grid grid--2">
          <label className="field">
            <span className="label">{t("tutor.form.bio")}</span>
            <textarea
              className="textarea"
              rows={5}
              value={state.bioAr}
              onChange={(event) => setState({ ...state, bioAr: event.target.value })}
              maxLength={2000}
              required
            />
            <span className="field__hint">{t("tutor.form.bioHelp")}</span>
          </label>
          <label className="field">
            <span className="label">{t("tutor.form.bio")} (EN)</span>
            <textarea
              className="textarea"
              rows={5}
              dir="ltr"
              value={state.bioEn}
              onChange={(event) => setState({ ...state, bioEn: event.target.value })}
              maxLength={2000}
              required
            />
          </label>
        </div>
      </div>

      <div className="card stack-sm">
        <h2 style={{ fontSize: "1.05rem" }}>{t("tutor.form.section.professional")}</h2>
        <div className="grid grid--2">
          <label className="field">
            <span className="label">{t("tutor.form.qualification")}</span>
            <input
              className="input"
              value={state.qualification}
              onChange={(event) => setState({ ...state, qualification: event.target.value })}
              maxLength={160}
              required
              placeholder={t("tutor.form.qualificationPlaceholder")}
            />
          </label>
          <label className="field">
            <span className="label">{t("tutor.form.university")}</span>
            <input
              className="input"
              value={state.university}
              onChange={(event) => setState({ ...state, university: event.target.value })}
              maxLength={160}
            />
          </label>
          <label className="field">
            <span className="label">{t("tutor.form.major")}</span>
            <input
              className="input"
              value={state.major}
              onChange={(event) => setState({ ...state, major: event.target.value })}
              maxLength={120}
            />
          </label>
          <label className="field">
            <span className="label">{t("tutor.form.graduationYear")}</span>
            <input
              className="input"
              type="number"
              dir="ltr"
              min={1950}
              max={2100}
              value={state.graduationYear ?? ""}
              onChange={(event) => setState({ ...state, graduationYear: event.target.value ? Number(event.target.value) : null })}
            />
          </label>
          <label className="field">
            <span className="label">{t("tutor.form.yearsExperience")}</span>
            <input
              className="input"
              type="number"
              dir="ltr"
              min={0}
              max={60}
              value={state.yearsExperience}
              onChange={(event) => setState({ ...state, yearsExperience: Number(event.target.value) })}
            />
          </label>
          <label className="field">
            <span className="label">{t("tutor.form.gender")}</span>
            <select
              className="select"
              value={state.gender ?? ""}
              onChange={(event) => setState({ ...state, gender: event.target.value || null })}
            >
              <option value="">—</option>
              <option value="male">{t("booking.student.gender.male")}</option>
              <option value="female">{t("booking.student.gender.female")}</option>
            </select>
          </label>
        </div>

        {chipGroup("subjectIds", t("tutor.form.subjects"), t("tutor.form.subjectsHelp"), subjects)}
        {chipGroup("stageIds", t("tutor.form.stages"), null, stages)}
        {chipGroup("areaIds", t("tutor.form.areas"), t("tutor.form.area"), areas)}

        <fieldset className="stack-xs" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label">{t("tutor.form.languages")}</legend>
          <div className="row" style={{ gap: "0.35rem" }}>
            {(["ar", "en"] as const).map((code) => {
              const selected = state.languages.includes(code);
              return (
                <button
                  key={code}
                  type="button"
                  className={selected ? "chip chip--pale" : "chip"}
                  aria-pressed={selected}
                  onClick={() => toggle("languages", code)}
                >
                  {code === "ar" ? t("tutor.form.language.ar") : t("tutor.form.language.en")}
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>

      <div className="card stack-sm">
        <h2 style={{ fontSize: "1.05rem" }}>{t("tutor.form.section.teaching")}</h2>
        <label className="check">
          <input
            type="checkbox"
            checked={state.teachesHome}
            onChange={(event) => setState({ ...state, teachesHome: event.target.checked })}
          />
          <span>{t("tutor.form.teachesHome")}</span>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={state.teachesOnline}
            onChange={(event) => setState({ ...state, teachesOnline: event.target.checked })}
          />
          <span>{t("tutor.form.teachesOnline")}</span>
        </label>
        <p className="field__hint">{t("tutor.form.reviewNote")}</p>
      </div>

      <div className="card stack-sm">
        <h2 style={{ fontSize: "1.05rem" }}>{t("tutor.form.section.pricing")}</h2>
        <label className="field" style={{ maxWidth: "16rem" }}>
          <span className="label">{t("tutor.form.pricePerHour")}</span>
          <input
            className="input"
            type="number"
            dir="ltr"
            min={0.5}
            max={1000}
            step={0.5}
            value={state.pricePerHour}
            onChange={(event) => setState({ ...state, pricePerHour: event.target.value })}
          />
          <span className="field__hint">{t("tutor.form.priceHelp")}</span>
        </label>
      </div>

      <div className="row" style={{ gap: "0.5rem" }}>
        <button className="btn btn--primary" type="submit" disabled={busy} aria-busy={busy}>
          {busy ? t("state.saving") : t("tutor.form.submit")}
        </button>
        <span role="status" aria-live="polite" className="field__hint" style={{ color: error ? "var(--danger)" : "var(--ok)" }}>
          {error ?? done ?? ""}
        </span>
      </div>

      {status !== "approved" ? <p className="notice notice--info">{t("tutor.form.profileIncomplete")}</p> : null}
    </form>
  );
}
