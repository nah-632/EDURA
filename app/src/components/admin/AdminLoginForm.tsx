"use client";

/**
 * Admin sign-in.
 *
 * A separate component from the customer AuthForm because an admin session has
 * different rules: the second factor is MANDATORY (the server refuses an admin
 * login without a valid TOTP code), the session is short-lived, and success
 * lands on the console rather than the customer dashboard.
 *
 * The form does not try to pre-validate credentials, and it never reveals which
 * factor failed - the server's answer is `mfa_required` / `mfa_invalid` /
 * `invalid_credentials`, and all three are shown as one message to a caller who
 * cannot prove they hold the password.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

import { createTranslator, type DictKey, type Locale } from "@/lib/i18n";
import { errorKeyFor } from "@/lib/i18n/api-errors";

const MFA_KEYS: Record<string, DictKey> = {
  mfa_required: "auth.mfaRequired",
  mfa_invalid: "auth.mfaInvalid",
  invalid_credentials: "auth.invalidCredentials",
  account_locked: "auth.accountDisabled",
  account_suspended: "auth.suspended",
};

export function AdminLoginForm({ locale }: { locale: Locale }) {
  const t = createTranslator(locale);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [needsMfa, setNeedsMfa] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "login",
          payload: {
            email: String(data.get("email") ?? ""),
            password: String(data.get("password") ?? ""),
          },
          mfaCode: String(data.get("mfaCode") ?? "") || null,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; user?: { isAdmin?: boolean } };
      if (!res.ok || !body.ok) {
        if (body.error === "mfa_required") setNeedsMfa(true);
        setError(t(MFA_KEYS[body.error ?? ""] ?? errorKeyFor(body.error)));
        return;
      }
      // The session route decides the session kind; an account that is not an
      // admin lands here too, and the console will send them back politely
      // rather than pretending they have access.
      router.replace(`/${locale}/admin`);
      router.refresh();
    } catch {
      setError(t("error.network"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-form card stack-sm" onSubmit={onSubmit}>
      <h1 className="display display--section" style={{ fontSize: "var(--text-h3)" }}>
        {t("admin.signInTitle")}
      </h1>
      <p className="field__hint">{t("admin.signInBody")}</p>

      <label className="field">
        <span className="label">{t("auth.email")}</span>
        <input className="input" type="email" name="email" autoComplete="username" required dir="ltr" />
      </label>

      <label className="field">
        <span className="label">{t("auth.password")}</span>
        <input className="input" type="password" name="password" autoComplete="current-password" required dir="ltr" />
      </label>

      {needsMfa ? (
        <label className="field">
          <span className="label">{t("auth.mfaCode")}</span>
          <input className="input" type="text" name="mfaCode" inputMode="numeric" autoComplete="one-time-code" maxLength={6} dir="ltr" />
          <span className="field__hint">{t("auth.mfaHelp")}</span>
        </label>
      ) : null}

      <div className="row" style={{ gap: "0.5rem" }}>
        <button className="btn btn--primary" type="submit" disabled={busy} aria-busy={busy}>
          {busy ? t("state.saving") : t("auth.submitLogin")}
        </button>
        <span role="status" aria-live="polite" className="field__hint" style={{ color: "var(--danger)" }}>
          {error ?? ""}
        </span>
      </div>
    </form>
  );
}
