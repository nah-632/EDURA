"use client";

/**
 * Account deletion (§25).
 *
 * Requires the operator-assisted confirmation word from the design copy, shows
 * exactly what will be removed and what will be kept BEFORE it runs, and is the
 * only destructive action in the product that ends with the user being signed
 * out - so it clears the session cookie server-side and navigates home.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

import { createTranslator, type Locale } from "@/lib/i18n";
import { errorKeyFor } from "@/lib/i18n/api-errors";

export function DeleteAccountForm({
  locale,
  confirmWord,
  removed,
  retained,
}: {
  locale: Locale;
  confirmWord: string;
  removed: string[];
  retained: string[];
}) {
  const t = createTranslator(locale);
  const router = useRouter();
  const [value, setValue] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/me", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Re-authentication is required: an irreversible action is not
        // authorised by a live session alone.
        body: JSON.stringify({ action: "delete_account", confirm: "delete", password }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(t(errorKeyFor(body.error)));
        return;
      }
      router.replace(`/${locale}`);
      router.refresh();
    } catch {
      setError(t("error.network"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack-sm" onSubmit={onSubmit}>
      <h2 style={{ fontSize: "1.05rem" }}>{t("privacy.title")}</h2>
      <p className="notice notice--warn">{t("privacy.deleteWarning")}</p>

      <div className="grid grid--2">
        <div className="stack-xs">
          <strong>{t("privacy.deleteAccount")}</strong>
          <ul className="stack-xs" style={{ margin: 0, paddingInlineStart: "1.1rem" }}>
            {removed.map((item) => (
              <li key={item} className="soft">
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="stack-xs">
          <strong>{t("privacy.retentionTitle")}</strong>
          <ul className="stack-xs" style={{ margin: 0, paddingInlineStart: "1.1rem" }}>
            {retained.map((item) => (
              <li key={item} className="soft">
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <label className="field">
        <span className="label">{t("privacy.deleteConfirmLabel", { word: confirmWord })}</span>
        <input className="input" value={value} onChange={(event) => setValue(event.target.value)} aria-required="true" />
      </label>

      <label className="field">
        <span className="label">{t("auth.password")}</span>
        <input
          className="input"
          type="password"
          dir="ltr"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-required="true"
        />
      </label>

      <div className="row" style={{ gap: "0.5rem" }}>
        <button
          className="btn btn--danger btn--sm"
          type="submit"
          disabled={busy || value.trim() !== confirmWord || password.length === 0}
          aria-busy={busy}
        >
          {busy ? t("state.saving") : t("privacy.deleteAccount")}
        </button>
        <span role="status" aria-live="polite" className="field__hint" style={{ color: "var(--danger)" }}>
          {error ?? ""}
        </span>
      </div>
    </form>
  );
}
