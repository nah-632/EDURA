import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { BookingStepper } from "@/components/booking/BookingStepper";
import { sessionFromCookieHeader } from "@/lib/auth/service";
import { createTranslator, type Locale } from "@/lib/i18n";
import { listStages, listSubjects } from "@/lib/data/catalog";
import { getPublicTutor, getTutorAvailability } from "@/lib/data/tutors";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const t = createTranslator(locale as Locale);
  const tutor = await getPublicTutor(locale as Locale, slug);
  return { title: tutor ? `${t("booking.title")} — ${tutor.name}` : t("booking.detail.notFound"), robots: { index: false } };
}

export default async function BookPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale: rawLocale, slug } = await params;
  const query = await searchParams;
  const locale = rawLocale as Locale;
  const t = createTranslator(locale);

  const tutor = await getPublicTutor(locale, slug);
  if (!tutor) notFound();

  const cookieHeader = (await headers()).get("cookie");
  const [availability, subjects, stages, session] = await Promise.all([
    getTutorAvailability(tutor.id),
    listSubjects(locale),
    listStages(locale),
    sessionFromCookieHeader(cookieHeader),
  ]);

  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const subjectParam = first(query.subject) ?? tutor.subjects[0] ?? "";
  const durationParam = Number(first(query.duration) ?? 60);
  const methodParam = first(query.method) === "home" ? "home" : "online";

  return (
    <section className="section">
      <div className="shell stack">
        <div className="stack-xs">
          <h1 className="display display--section" style={{ fontSize: "var(--text-h3)" }}>
            {t("booking.subtitle")}
          </h1>
        </div>

        <div className="booking-layout">
          <BookingStepper
            locale={locale}
            tutor={{
              id: tutor.id,
              slug: tutor.slug,
              name: tutor.name,
              pricePerHour: tutor.pricePerHour,
              teachesHome: tutor.teachesHome,
              teachesOnline: tutor.teachesOnline,
            }}
            windows={availability.map((a) => ({ weekday: a.weekday, startTime: a.startTime, endTime: a.endTime }))}
            signedIn={Boolean(session)}
            initial={{
              subject: subjectParam,
              duration: Number.isFinite(durationParam) ? durationParam : 60,
              method: methodParam,
            }}
            labels={{
              tutor: t("booking.step.tutor"),
              student: t("booking.step.student"),
              lesson: t("booking.step.lesson"),
              schedule: t("booking.step.schedule"),
              confirm: t("booking.step.confirm"),
              progress: t("a11y.progress"),
              studentTitle: t("booking.student.select"),
              studentName: t("booking.student.name"),
              studentNamePlaceholder: t("booking.student.namePlaceholder"),
              studentStage: t("booking.student.stage"),
              studentGrade: t("booking.student.grade"),
              studentNotes: t("booking.student.notes"),
              studentNotesHelp: t("booking.student.notesHelp"),
              minorNotice: t("booking.student.minorNotice"),
              choose: t("validation.selectOption"),
              stages: stages.map((s) => s.name).join("|"),
              lessonTitle: t("booking.lessonType.select"),
              subject: t("booking.subject.select"),
              subjects: tutor.subjects.join("|"),
              method: t("booking.method.select"),
              home: t("booking.method.home"),
              online: t("booking.method.online"),
              area: t("booking.area.select"),
              homeHelp: t("booking.method.homeHelp"),
              duration: t("booking.schedule.duration"),
              minutes: t("label.minutes"),
              scheduleTitle: t("booking.schedule.title"),
              date: t("booking.schedule.date"),
              time: t("booking.schedule.time"),
              availabilityHint: t("booking.schedule.availabilityHint"),
              noSlots: t("booking.schedule.noSlots"),
              confirmTitle: t("booking.confirm.title"),
              tutorLabel: t("booking.detail.tutor"),
              studentLabel: t("booking.detail.student"),
              total: t("booking.price.total"),
              notes: t("booking.notes"),
              notesPlaceholder: t("booking.notesPlaceholder"),
              acceptTerms: t("booking.terms.accept"),
              signInRequired: t("auth.signInToContinue"),
              submit: t("booking.submit"),
              submitting: t("booking.submitting"),
              back: t("cta.back"),
              next: t("cta.next"),
              createdTitle: t("booking.created.title"),
              createdBody: t("booking.created.body"),
              whatsappNote: t("booking.created.whatsappNote"),
              openWhatsapp: t("cta.openWhatsapp"),
              viewBookings: t("booking.list.title"),
              paymentNote: t("payment.manualNotice"),
              error_slot_taken: t("error.slotTaken"),
              error_unauthorized: t("state.unauthorized"),
              error_not_configured: t("error.notConfigured"),
              error_network: t("error.network"),
              error_validation: t("error.validation"),
              errorUnexpected: t("error.unexpected"),
            }}
          />

          <aside className="stack-sm">
            <div className="panel">
              <div className="panel__head">
                <strong>{tutor.name}</strong>
              </div>
              <div className="panel__body stack-xs">
                <p className="soft">{tutor.headline}</p>
                <p className="field__hint">{t("booking.price.calculated")}</p>
                <p className="field__hint">{t("payment.manualNotice")}</p>
              </div>
            </div>
            <div className="notice notice--info">{t("booking.student.minorNotice")}</div>
          </aside>
        </div>
      </div>
    </section>
  );
}
