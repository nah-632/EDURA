"use client";

/**
 * Multipart form.
 *
 * Used for the two upload paths that exist: a tutor's verification document and
 * a payment proof. It is separate from ActionForm because a file cannot be sent
 * as JSON, and because uploads need their own progress/error wording
 * (unsupported type, too large, storage not configured).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

import { createTranslator, type Locale } from "@/lib/i18n";
import { errorKeyFor } from "@/lib/i18n/api-errors";
import type { FormField } from "./ActionForm";

export interface UploadFormProps {
  locale: Locale;
  endpoint: string;
  extra?: Record<string, unknown>;
  fields?: FormField[];
  fileLabel: string;
  fileHelp?: string;
  accept?: string;
  /** hide the file input entirely (note-only submissions) */
  showFile?: boolean;
  fileRequired?: boolean;
  submitLabel: string;
  successText?: string;
  title?: string;
  help?: string;
}

export function UploadForm({
  locale,
  endpoint,
  extra = {},
  fields = [],
  fileLabel,
  fileHelp,
  accept = "image/png,image/jpeg,image/webp,application/pdf",
  showFile = true,
  fileRequired = true,
  submitLabel,
  successText,
  title,
  help,
}: UploadFormProps) {
  const t = createTranslator(locale);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setError(null);
    setDone(false);

    const body = new FormData();
    for (const [key, value] of Object.entries(extra)) body.set(key, String(value));
    for (const field of fields) {
      if (field.kind === "hidden") {
        body.set(field.name, field.value);
        continue;
      }
      const raw = form.elements.namedItem(field.name);
      if (!raw) continue;
      if (field.kind === "checkbox") {
        body.set(field.name, (raw as HTMLInputElement).checked ? "true" : "false");
      } else {
        body.set(field.name, String((raw as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value));
      }
    }
    const fileInput = form.elements.namedItem("file") as HTMLInputElement | null;
    const file = fileInput?.files?.[0];
    if (file) body.set("file", file);

    try {
      const res = await fetch(endpoint, { method: "POST", body });
      const payload = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !payload.ok) {
        setError(t(errorKeyFor(payload.error)));
        return;
      }
      setDone(true);
      form.reset();
      router.refresh();
    } catch {
      setError(t("error.network"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack-sm" onSubmit={onSubmit}>
      {title ? <h2 style={{ fontSize: "1.05rem" }}>{title}</h2> : null}
      {help ? <p className="field__hint">{help}</p> : null}

      {fields.map((field) => {
        if (field.kind === "hidden") return <input key={field.name} type="hidden" name={field.name} value={field.value} readOnly />;
        if (field.kind === "select") {
          return (
            <label className="field" key={field.name}>
              <span className="label">{field.label}</span>
              <select className="select" name={field.name} defaultValue={field.value ?? ""}>
                {field.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {field.help ? <span className="field__hint">{field.help}</span> : null}
            </label>
          );
        }
        if (field.kind === "textarea") {
          return (
            <label className="field" key={field.name}>
              <span className="label">{field.label}</span>
              <textarea className="textarea" name={field.name} rows={field.rows ?? 2} defaultValue={field.value ?? ""} />
            </label>
          );
        }
        return (
          <label className="field" key={field.name}>
            <span className="label">{field.label}</span>
            <input
              className="input"
              type="text"
              name={field.name}
              /* The fallback branch also covers boolean fields, and
                 `defaultValue` takes no boolean - String() keeps it honest. */
              defaultValue={String(field.value ?? "")}
            />
          </label>
        );
      })}

      {showFile ? (
        <label className="field">
          <span className="label">{fileLabel}</span>
          <input className="input" type="file" name="file" accept={accept} required={fileRequired} />
          {fileHelp ? <span className="field__hint">{fileHelp}</span> : null}
        </label>
      ) : null}

      <div className="row" style={{ gap: "0.5rem" }}>
        <button className="btn btn--primary btn--sm" type="submit" disabled={busy} aria-busy={busy}>
          {busy ? t("state.saving") : submitLabel}
        </button>
        <span role="status" aria-live="polite" className="field__hint" style={{ color: error ? "var(--danger)" : "var(--ok)" }}>
          {error ?? (done ? (successText ?? t("state.saved")) : "")}
        </span>
      </div>
    </form>
  );
}
