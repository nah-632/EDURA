import { AvailabilityEditor } from "@/components/tutor/AvailabilityEditor";
import { requirePageSession } from "@/lib/auth/server";
import { listAvailability, listTimeOff } from "@/lib/tutor/service";
import { dbConfigured } from "@/lib/db";
import { createTranslator, resolveLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * /[locale]/tutor/availability (§7.2, §23).
 *
 * What is saved here is exactly what the booking engine trusts: a booking is
 * only accepted when the requested time falls inside one of these windows and
 * outside every time-off block.
 */
export default async function TutorAvailabilityPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = resolveLocale(rawLocale);
  const gate = await requirePageSession({ requireTutor: true });
  const t = createTranslator(locale);
  if (!gate.ok) return null;

  const dbReady = dbConfigured();
  const [windows, timeOff] = dbReady
    ? await Promise.all([
        listAvailability(gate.session.user.tutorId!).catch(() => []),
        listTimeOff(gate.session.user.tutorId!).catch(() => []),
      ])
    : [[], []];

  return (
    <div className="admin-section">
      <div className="stack-xs">
        <h1 className="display display--section" style={{ fontSize: "var(--text-h3)" }}>
          {t("tutor.availability.title")}
        </h1>
        <p className="field__hint">{t("tutor.availability.help")}</p>
      </div>

      {!dbReady ? <p className="notice notice--warn">{t("error.notConfigured")}</p> : null}

      <AvailabilityEditor
        locale={locale}
        initial={windows.map((window) => ({
          weekday: window.weekday,
          startTime: window.startTime,
          endTime: window.endTime,
        }))}
        timeOff={timeOff}
      />
    </div>
  );
}
