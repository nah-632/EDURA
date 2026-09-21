"use client";

/**
 * Action button.
 *
 * The only way the console performs a single-step mutation. It exists so that
 * three rules are applied identically everywhere instead of being re-implemented
 * per screen:
 *
 *  1. An action that restricts someone (reject, suspend, refund) collects its
 *     reason BEFORE the request, because the server refuses without one.
 *  2. A destructive action asks for confirmation in the page, not in a browser
 *     `confirm()` dialog that a native webview may swallow.
 *  3. Success and failure are announced through `aria-live`, and a failure
 *     renders the translated message for the API's stable error code.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

import { createTranslator, type DictKey, type Locale } from "@/lib/i18n";
import { errorKeyFor } from "@/lib/i18n/api-errors";

export interface ActionButtonProps {
  locale: Locale;
  endpoint: string;
  payload: Record<string, unknown>;
  label: string;
  variant?: "primary" | "outline" | "danger" | "quiet";
  size?: "sm" | "md";
  /** ask for a written reason before sending */
  reasonLabel?: string;
  reasonRequired?: boolean;
  confirmText?: string;
  successText?: string;
  disabled?: boolean;
  disabledReason?: string;
  /** called after a successful action instead of refreshing the route */
  onDone?: "refresh" | "reload" | "none";
}

type Phase = "idle" | "prompt" | "busy" | "done" | "error";

export function ActionButton({
  locale,
  endpoint,
  payload,
  label,
  variant = "outline",
  size = "sm",
  reasonLabel,
  reasonRequired = false,
  confirmText,
  successText,
  disabled = false,
  disabledReason,
  onDone = "refresh",
}: ActionButtonProps) {
  const t = createTranslator(locale);
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const needsPrompt = Boolean(reasonLabel || confirmText);

  async function send(withReason: string | null) {
    setPhase("busy");
    setMessage(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withReason ? { ...payload, reason: withReason } : payload),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; detail?: string };
      if (!res.ok || !body.ok) {
        setPhase("error");
        setMessage(t(errorKeyFor(body.error) as DictKey));
        return;
      }
      setPhase("done");
      setMessage(successText ?? t("state.saved"));
      setReason("");
      if (onDone === "refresh") router.refresh();
      if (onDone === "reload") router.refresh();
    } catch {
      setPhase("error");
      setMessage(t("error.network"));
    }
  }

  const buttonClass = `btn btn--${variant === "danger" ? "danger" : variant}${size === "sm" ? " btn--sm" : ""}`;

  if (disabled) {
    return (
      <span className="stack-xs" style={{ display: "inline-flex", flexDirection: "column", gap: "0.25rem" }}>
        <button className={buttonClass} type="button" disabled aria-disabled="true">
          {label}
        </button>
        {disabledReason ? <span className="field__hint">{disabledReason}</span> : null}
      </span>
    );
  }

  return (
    <span className="stack-xs" style={{ display: "inline-flex", flexDirection: "column", gap: "0.4rem" }}>
      <button
        className={buttonClass}
        type="button"
        aria-busy={phase === "busy"}
        onClick={() => {
          if (needsPrompt) {
            setPhase(phase === "prompt" ? "idle" : "prompt");
            return;
          }
          void send(null);
        }}
      >
        {phase === "busy" ? t("state.saving") : label}
      </button>

      {phase === "prompt" ? (
        <span className="card stack-xs" style={{ padding: "0.6rem", maxWidth: "26rem" }}>
          {confirmText ? <span className="soft">{confirmText}</span> : null}
          {reasonLabel ? (
            <label className="field">
              <span className="label">{reasonLabel}</span>
              <textarea
                className="textarea"
                rows={2}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                aria-required={reasonRequired}
              />
            </label>
          ) : null}
          <span className="row" style={{ gap: "0.4rem" }}>
            <button
              className={buttonClass}
              type="button"
              disabled={reasonRequired && reason.trim().length < 3}
              onClick={() => void send(reason.trim() || null)}
            >
              {t("cta.confirm")}
            </button>
            <button className="btn btn--quiet btn--sm" type="button" onClick={() => setPhase("idle")}>
              {t("cta.cancel")}
            </button>
          </span>
        </span>
      ) : null}

      <span role="status" aria-live="polite" className="field__hint" style={{ color: phase === "error" ? "var(--danger)" : "var(--ok)" }}>
        {phase === "done" || phase === "error" ? message : ""}
      </span>
    </span>
  );
}
