"use client";

/**
 * Sign in / create account.
 *
 * Product surface: Open Sans / Noto Kufi Arabic, no display register, no parallax. Validation uses
 * the SAME zod schemas the API enforces, so the browser cannot accept something
 * the server will reject (and vice versa).
 */
import { useState } from "react";

import type { Locale } from "@/lib/i18n";
import { loginSchema, registerSchema } from "@/lib/validation/schemas";

export interface AuthFormProps {
  mode: "login" | "register";
  locale: Locale;
  labels: Record<string, string>;
}

export function AuthForm({ mode, locale, labels }: AuthFormProps) {
  const [values, setValues] = useState({
    fullName: "",
    email: "",
    phone: "",
    password: "",
    passwordConfirm: "",
    accountType: "student" as "student" | "tutor",
    mfaCode: "",
    acceptTerms: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "saving" | "error" | "done">("idle");
  const [serverError, setServerError] = useState<string | null>(null);

  const update = (patch: Partial<typeof values>) => setValues((v) => ({ ...v, ...patch }));

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setServerError(null);

    if (mode === "register") {
      const parsed = registerSchema.safeParse({
        fullName: values.fullName,
        email: values.email,
        phone: values.phone,
        password: values.password,
        accountType: values.accountType,
        locale,
        acceptTerms: values.acceptTerms,
      });
      const nextErrors: Record<string, string> = {};
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const key = issue.path.join(".") || "_";
          nextErrors[key] = labels[`v_${issue.message}`] ?? labels.v_required;
        }
      }
      if (values.password !== values.passwordConfirm) nextErrors.passwordConfirm = labels.v_passwordMismatch;
      setErrors(nextErrors);
      if (Object.keys(nextErrors).length > 0) return;
    } else {
      const parsed = loginSchema.safeParse({
        email: values.email,
        password: values.password,
        mfaCode: values.mfaCode || null,
      });
      if (!parsed.success) {
        const nextErrors: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          const key = issue.path.join(".") || "_";
          nextErrors[key] = labels[`v_${issue.message}`] ?? labels.v_required;
        }
        setErrors(nextErrors);
        return;
      }
      setErrors({});
    }

    setStatus("saving");
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "register"
            ? {
                action: "register",
                payload: {
                  fullName: values.fullName,
                  email: values.email,
                  phone: values.phone,
                  password: values.password,
                  accountType: values.accountType,
                  locale,
                  acceptTerms: true,
                },
              }
            : {
                action: "login",
                payload: { email: values.email, password: values.password },
                mfaCode: values.mfaCode || null,
              },
        ),
      });
      const body = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; user?: { role: string } };
      if (!response.ok || !body.ok) {
        setServerError(labels[`e_${body.error ?? "unexpected"}`] ?? labels.e_unexpected);
        setStatus("error");
        return;
      }
      setStatus("done");
      const destination = body.user?.role === "admin" ? "admin" : body.user?.role === "tutor" ? "tutor" : "dashboard";
      window.location.assign(`/${locale}/${destination}`);
    } catch {
      setServerError(labels.e_network);
      setStatus("error");
    }
  }

  return (
    <form className="panel auth-form" onSubmit={onSubmit} noValidate>
      <div className="panel__body stack-sm">
        <h1 className="display display--section" style={{ fontSize: "var(--text-h3)" }}>
          {mode === "login" ? labels.titleLogin : labels.titleRegister}
        </h1>

        {mode === "register" ? (
          <div className="field">
            <label className="label" htmlFor="a-name">
              {labels.fullName}
            </label>
            <input
              id="a-name"
              className="input"
              autoComplete="name"
              value={values.fullName}
              onChange={(e) => update({ fullName: e.target.value })}
              aria-invalid={Boolean(errors.fullName)}
              required
            />
            {errors.fullName ? <span className="field__error">{errors.fullName}</span> : null}
          </div>
        ) : null}

        <div className="field">
          <label className="label" htmlFor="a-email">
            {labels.email}
          </label>
          <input
            id="a-email"
            type="email"
            className="input"
            autoComplete="email"
            dir="ltr"
            value={values.email}
            onChange={(e) => update({ email: e.target.value })}
            aria-invalid={Boolean(errors.email)}
            required
          />
          {errors.email ? <span className="field__error">{errors.email}</span> : null}
        </div>

        {mode === "register" ? (
          <div className="field">
            <label className="label" htmlFor="a-phone">
              {labels.phone}
            </label>
            <input
              id="a-phone"
              className="input"
              inputMode="tel"
              dir="ltr"
              placeholder="+973 3XXX XXXX"
              value={values.phone}
              onChange={(e) => update({ phone: e.target.value })}
              aria-invalid={Boolean(errors.phone)}
              aria-describedby="a-phone-hint"
              required
            />
            <span className="field__hint" id="a-phone-hint">
              {labels.phoneHelp}
            </span>
            {errors.phone ? <span className="field__error">{errors.phone}</span> : null}
          </div>
        ) : null}

        <div className="field">
          <label className="label" htmlFor="a-password">
            {labels.password}
          </label>
          <input
            id="a-password"
            type="password"
            className="input"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={values.password}
            onChange={(e) => update({ password: e.target.value })}
            aria-invalid={Boolean(errors.password)}
            required
          />
          {errors.password ? <span className="field__error">{errors.password}</span> : null}
        </div>

        {mode === "register" ? (
          <>
            <div className="field">
              <label className="label" htmlFor="a-password2">
                {labels.passwordConfirm}
              </label>
              <input
                id="a-password2"
                type="password"
                className="input"
                autoComplete="new-password"
                value={values.passwordConfirm}
                onChange={(e) => update({ passwordConfirm: e.target.value })}
                aria-invalid={Boolean(errors.passwordConfirm)}
                required
              />
              {errors.passwordConfirm ? <span className="field__error">{errors.passwordConfirm}</span> : null}
            </div>

            <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="label">{labels.accountType}</legend>
              <div className="row" style={{ gap: "0.5rem" }}>
                {(["student", "tutor"] as const).map((type) => (
                  <label key={type} className={`chip ${values.accountType === type ? "chip--pale" : ""}`} style={{ cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="accountType"
                      value={type}
                      checked={values.accountType === type}
                      onChange={() => update({ accountType: type })}
                    />
                    {type === "student" ? labels.accountStudent : labels.accountTutor}
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="check">
              <input
                type="checkbox"
                checked={values.acceptTerms}
                onChange={(e) => update({ acceptTerms: e.target.checked })}
                aria-invalid={Boolean(errors.acceptTerms)}
              />
              <span>
                {labels.acceptTerms}{" "}
                <a href={`/${locale}/legal/terms`} style={{ color: "var(--accent-strong)", textDecoration: "underline" }}>
                  {labels.termsLink}
                </a>
              </span>
            </label>
            {errors.acceptTerms ? <span className="field__error">{errors.acceptTerms}</span> : null}
          </>
        ) : (
          <div className="field">
            <label className="label" htmlFor="a-mfa">
              {labels.mfaCode}
            </label>
            <input
              id="a-mfa"
              className="input"
              inputMode="numeric"
              autoComplete="one-time-code"
              dir="ltr"
              value={values.mfaCode}
              onChange={(e) => update({ mfaCode: e.target.value })}
              aria-describedby="a-mfa-hint"
            />
            <span className="field__hint" id="a-mfa-hint">
              {labels.mfaHelp}
            </span>
          </div>
        )}

        {serverError ? (
          <p className="notice notice--error" role="alert">
            {serverError}
          </p>
        ) : null}

        <button type="submit" className="btn btn--primary btn--lg" disabled={status === "saving"}>
          {status === "saving" ? labels.submitting : mode === "login" ? labels.submitLogin : labels.submitRegister}
        </button>

        <p className="field__hint">
          {mode === "login" ? (
            <>
              {labels.noAccount}{" "}
              <a href={`/${locale}/register`} style={{ color: "var(--accent-strong)" }}>
                {labels.registerLink}
              </a>
            </>
          ) : (
            <>
              {labels.haveAccount}{" "}
              <a href={`/${locale}/login`} style={{ color: "var(--accent-strong)" }}>
                {labels.loginLink}
              </a>
            </>
          )}
        </p>
        <p className="field__hint">{labels.guestNote}</p>
      </div>
    </form>
  );
}
