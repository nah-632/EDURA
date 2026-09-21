import Link from "next/link";

import { createTranslator, formatMoney, type DictKey, type Locale } from "@/lib/i18n";

/**
 * Console presentation primitives (server components).
 *
 * Small and unopinionated on purpose: the console is a data tool, so the same
 * four shapes - a KPI tile, a status pill, a table in a scroll container and an
 * honest empty state - are reused everywhere instead of each screen inventing
 * its own.
 */

export function Kpi({
  label,
  value,
  hint,
  warn = false,
}: {
  label: string;
  value: string | number;
  hint?: string;
  warn?: boolean;
}) {
  return (
    <div className={warn ? "kpi kpi--warn" : "kpi"}>
      <span className="kpi__value tnum">{value}</span>
      <span className="kpi__label">{label}</span>
      {hint ? <span className="kpi__hint">{hint}</span> : null}
    </div>
  );
}

export function KpiGrid({ children }: { children: React.ReactNode }) {
  return <div className="kpi-grid">{children}</div>;
}

type PillTone = "ok" | "warn" | "danger" | "info";

/**
 * Status pill. The label always carries the meaning - colour is a second,
 * redundant signal, never the only one (§30).
 */
export function StatusPill({ tone, label }: { tone: PillTone; label: string }) {
  return <span className={`status status--${tone}`}>{label}</span>;
}

const BOOKING_TONES: Record<string, PillTone> = {
  pending_payment: "warn",
  payment_verification: "warn",
  paid: "info",
  confirmed: "info",
  tutor_accepted: "info",
  scheduled: "info",
  in_progress: "info",
  completed: "ok",
  cancelled: "danger",
  rejected: "danger",
  refund_requested: "warn",
  refunded: "danger",
};

const TUTOR_TONES: Record<string, PillTone> = {
  pending: "warn",
  under_review: "warn",
  approved: "ok",
  rejected: "danger",
  suspended: "danger",
  expired_subscription: "warn",
};

const PAYMENT_TONES: Record<string, PillTone> = {
  pending: "warn",
  submitted: "warn",
  verified: "ok",
  rejected: "danger",
  refunded: "danger",
};

const REVIEW_TONES: Record<string, PillTone> = {
  pending: "warn",
  published: "ok",
  hidden: "info",
  reported: "danger",
};

export function BookingStatus({ locale, status }: { locale: Locale; status: string }) {
  const t = createTranslator(locale);
  return <StatusPill tone={BOOKING_TONES[status] ?? "info"} label={t(`booking.status.${status}` as DictKey)} />;
}

export function TutorStatus({ locale, status }: { locale: Locale; status: string }) {
  const t = createTranslator(locale);
  return <StatusPill tone={TUTOR_TONES[status] ?? "info"} label={t(`tutor.status.${status}` as DictKey)} />;
}

export function PaymentStatus({ locale, status }: { locale: Locale; status: string | null }) {
  const t = createTranslator(locale);
  if (!status) return <span className="muted">—</span>;
  return <StatusPill tone={PAYMENT_TONES[status] ?? "info"} label={t(`payment.status.${status}` as DictKey)} />;
}

export function ReviewStatus({ locale, status }: { locale: Locale; status: string }) {
  const t = createTranslator(locale);
  return <StatusPill tone={REVIEW_TONES[status] ?? "info"} label={t(`admin.reviews.status.${status}` as DictKey)} />;
}

export function UserStatus({ locale, status }: { locale: Locale; status: string }) {
  const t = createTranslator(locale);
  const tone: PillTone = status === "active" ? "ok" : status === "restricted" ? "warn" : "danger";
  return <StatusPill tone={tone} label={t(`admin.users.status.${status}` as DictKey)} />;
}

/**
 * The console's honest empty state. `dbReady === false` is a DIFFERENT message
 * from "no rows yet": an operator must be able to tell a quiet platform from a
 * broken one (§16).
 */
export function DataState({
  locale,
  dbReady,
  isEmpty,
  emptyTitle,
  emptyBody,
  children,
}: {
  locale: Locale;
  dbReady: boolean;
  isEmpty: boolean;
  emptyTitle?: DictKey;
  emptyBody?: DictKey;
  children: React.ReactNode;
}) {
  const t = createTranslator(locale);
  if (!dbReady) {
    return (
      <div className="card stack-xs">
        <strong>{t("error.notConfigured")}</strong>
        <p className="field__hint">{t("admin.overview.noData")}</p>
      </div>
    );
  }
  if (isEmpty) {
    return (
      <div className="card stack-xs">
        <strong>{t(emptyTitle ?? "state.emptyTitle")}</strong>
        <p className="soft">{t(emptyBody ?? "state.emptyBody")}</p>
      </div>
    );
  }
  return <>{children}</>;
}

/** Horizontally scrollable table container (mobile-safe, §29). */
export function TableScroll({ children }: { children: React.ReactNode }) {
  return (
    <div className="panel table-scroll">
      <table className="table">{children}</table>
    </div>
  );
}

export function Money({ value, locale }: { value: string; locale: Locale }) {
  return <span className="tnum">{formatMoney(value, locale)}</span>;
}

/**
 * Link-based filter bar: filters are URLs, so a filtered view can be shared,
 * bookmarked and used with JavaScript disabled (§30).
 */
export function FilterLinks({
  base,
  current,
  options,
  label,
}: {
  base: string;
  current: string;
  options: { value: string; label: string }[];
  label: string;
}) {
  return (
    <nav className="admin-filter" aria-label={label}>
      {options.map((option) => (
        <Link
          key={option.value}
          href={`${base}${base.includes("?") ? "&" : "?"}status=${encodeURIComponent(option.value)}`}
          aria-current={current === option.value ? "true" : undefined}
        >
          {option.label}
        </Link>
      ))}
    </nav>
  );
}

/** Bar chart from plain data. No chart library, no canvas, renders server-side. */
export function BarChart({
  rows,
  emptyLabel,
}: {
  rows: { label: string; value: number }[];
  emptyLabel: string;
}) {
  if (rows.length === 0) return <p className="field__hint">{emptyLabel}</p>;
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <div className="bar-chart">
      {rows.map((row) => (
        <div className="bar-chart__row" key={row.label}>
          <span className="muted tnum">{row.label}</span>
          <span className="bar-chart__track">
            <span className="bar-chart__fill" style={{ width: `${Math.round((row.value / max) * 100)}%` }} />
          </span>
          <span className="tnum">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Page heading used by every console screen. */
export function AdminHeading({
  kicker,
  title,
  subtitle,
  actions,
}: {
  kicker: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="row--between" style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", alignItems: "flex-end" }}>
      <div className="stack-xs">
        <span className="kicker tracked">{kicker}</span>
        <h1 className="display display--section" style={{ fontSize: "var(--text-h3)" }}>
          {title}
        </h1>
        {subtitle ? <p className="field__hint">{subtitle}</p> : null}
      </div>
      {actions ? <div className="admin-actions">{actions}</div> : null}
    </div>
  );
}
