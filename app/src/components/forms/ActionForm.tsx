"use client";

/**
 * Action form.
 *
 * One client component renders every JSON-backed form in the product: the admin
 * settings screen, the CMS editor, catalogue rows, plans, the announcement
 * composer, the booking/zoom form, student records and the tutor profile. The
 * field list is DATA supplied by a server component, which keeps the forms
 * declarative and stops twenty near-identical components from drifting apart.
 *
 * Values are read from FormData at submit time, coerced using the field
 * metadata, and posted as JSON. Anything the server rejects comes back as a
 * stable code and is rendered in the reader's language.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

import { createTranslator, type Locale } from "@/lib/i18n";
import { errorKeyFor } from "@/lib/i18n/api-errors";

export type FormField =
  | {
      kind: "text" | "password" | "url" | "email";
      name: string;
      label: string;
      value?: string | null;
      placeholder?: string;
      help?: string;
      required?: boolean;
      maxLength?: number;
      autoComplete?: string;
      dir?: "ltr" | "rtl";
    }
  | {
      kind: "number";
      name: string;
      label: string;
      value?: number | null;
      min?: number;
      max?: number;
      step?: number;
      help?: string;
      required?: boolean;
    }
  | { kind: "textarea"; name: string; label: string; value?: string | null; rows?: number; help?: string; maxLength?: number }
  | { kind: "checkbox"; name: string; label: string; value?: boolean; help?: string }
  | {
      kind: "select";
      name: string;
      label: string;
      value?: string | null;
      options: { value: string; label: string }[];
      help?: string;
    }
  | { kind: "hidden"; name: string; value: string };

export interface ActionFormProps {
  locale: Locale;
  endpoint: string;
  /** merged into the payload on submit (e.g. { action: "upsert" }) */
  extra?: Record<string, unknown>;
  fields: FormField[];
  submitLabel: string;
  successText?: string;
  title?: string;
  help?: string;
  variant?: "primary" | "outline";
  /** reset the form after success (used when creating a new row) */
  resetAfterSubmit?: boolean;
  compact?: boolean;
}

export function ActionForm({
  locale,
  endpoint,
  extra = {},
  fields,
  submitLabel,
  successText,
  title,
  help,
  variant = "primary",
  resetAfterSubmit = false,
  compact = false,
}: ActionFormProps) {
  const t = createTranslator(locale);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setDone(false);
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload: Record<string, unknown> = { ...extra };

    // Dotted field names build nested objects ("notificationPrefs.booking_updates"),
    // which is how the preference checkboxes reach the API as a single object
    // without a bespoke component per form.
    const assign = (name: string, value: unknown) => {
      const parts = name.split(".");
      if (parts.length === 1) {
        payload[name] = value;
        return;
      }
      let cursor = payload;
      for (const part of parts.slice(0, -1)) {
        const current = cursor[part];
        if (!current || typeof current !== "object") cursor[part] = {};
        cursor = cursor[part] as Record<string, unknown>;
      }
      cursor[parts[parts.length - 1]!] = value;
    };

    for (const field of fields) {
      if (field.kind === "hidden") continue;
      if (field.kind === "checkbox") {
        assign(field.name, data.get(field.name) === "on");
      } else if (field.kind === "number") {
        const raw = String(data.get(field.name) ?? "").trim();
        if (raw === "") {
          if (field.required) {
            setBusy(false);
            setError(t("validation.required"));
            return;
          }
          assign(field.name, null);
        } else {
          assign(field.name, Number(raw));
        }
      } else {
        const raw = String(data.get(field.name) ?? "");
        const value = raw.trim();
        if (!value && field.required) {
          setBusy(false);
          setError(t("validation.required"));
          return;
        }
        assign(field.name, value === "" ? null : value);
      }
    }

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(t(errorKeyFor(body.error)));
        return;
      }
      setDone(true);
      if (resetAfterSubmit) form.reset();
      router.refresh();
    } catch {
      setError(t("error.network"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={compact ? "stack-xs" : "card stack-sm"} onSubmit={onSubmit}>
      {title ? <h2 style={{ fontSize: "1.05rem" }}>{title}</h2> : null}
      {help ? <p className="field__hint">{help}</p> : null}

      {fields.map((field) => {
        if (field.kind === "hidden") {
          return <input key={field.name} type="hidden" name={field.name} defaultValue={field.value} />;
        }
        if (field.kind === "checkbox") {
          return (
            <label className="check" key={field.name}>
              <input type="checkbox" name={field.name} defaultChecked={Boolean(field.value)} />
              <span>
                {field.label}
                {field.help ? <span className="field__hint">{field.help}</span> : null}
              </span>
            </label>
          );
        }
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
              <textarea
                className="textarea"
                name={field.name}
                rows={field.rows ?? 3}
                maxLength={field.maxLength}
                defaultValue={field.value ?? ""}
              />
              {field.help ? <span className="field__hint">{field.help}</span> : null}
            </label>
          );
        }
        return (
          <label className="field" key={field.name}>
            <span className="label">{field.label}</span>
            <input
              className="input"
              type={field.kind === "number" ? "number" : field.kind === "password" ? "password" : field.kind === "email" ? "email" : "text"}
              name={field.name}
              defaultValue={field.kind === "number" ? (field.value ?? "") : (field.value ?? "")}
              placeholder={field.kind === "number" ? undefined : field.placeholder}
              min={field.kind === "number" ? field.min : undefined}
              max={field.kind === "number" ? field.max : undefined}
              step={field.kind === "number" ? field.step : undefined}
              maxLength={field.kind === "number" ? undefined : field.maxLength}
              autoComplete={field.kind === "number" ? undefined : field.autoComplete}
              dir={field.kind === "number" ? "ltr" : field.dir}
              required={field.required}
            />
            {field.help ? <span className="field__hint">{field.help}</span> : null}
          </label>
        );
      })}

      <div className="row" style={{ gap: "0.5rem" }}>
        <button className={`btn btn--${variant} btn--sm`} type="submit" disabled={busy} aria-busy={busy}>
          {busy ? t("state.saving") : submitLabel}
        </button>
        <span role="status" aria-live="polite" className="field__hint" style={{ color: error ? "var(--danger)" : "var(--ok)" }}>
          {error ?? (done ? (successText ?? t("state.saved")) : "")}
        </span>
      </div>
    </form>
  );
}
