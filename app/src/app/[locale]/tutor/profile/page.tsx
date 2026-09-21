import { TutorProfileForm } from "@/components/tutor/TutorProfileForm";
import { requirePageSession } from "@/lib/auth/server";
import { listAreas, listStages, listSubjects } from "@/lib/data/catalog";
import { getTutorOwnProfile } from "@/lib/tutor/service";
import { dbConfigured } from "@/lib/db";
import { createTranslator, resolveLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * /[locale]/tutor/profile (§7.2).
 *
 * The profile a customer will eventually read - edited in the same shape it is
 * published in, with the verification note next to the fields that get reviewed.
 */
export default async function TutorProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = resolveLocale(rawLocale);
  const gate = await requirePageSession({ requireTutor: true });
  const t = createTranslator(locale);
  if (!gate.ok) return null;

  const [profile, subjects, stages, areas] = await Promise.all([
    dbConfigured() ? getTutorOwnProfile(gate.session.user.id).catch(() => null) : Promise.resolve(null),
    listSubjects(locale),
    listStages(locale),
    listAreas(locale),
  ]);

  if (!profile) {
    return (
      <div className="card stack-xs">
        <strong>{t("error.notConfigured")}</strong>
        <p className="soft">{t("tutor.form.profileIncomplete")}</p>
      </div>
    );
  }

  return (
    <div className="admin-section">
      <div className="stack-xs">
        <h1 className="display display--section" style={{ fontSize: "var(--text-h3)" }}>
          {t("tutor.form.section.personal")}
        </h1>
        <p className="field__hint">{t("tutor.form.reviewNote")}</p>
      </div>

      <TutorProfileForm
        locale={locale}
        status={profile.status}
        subjects={subjects.map((option) => ({ id: option.id, name: option.name }))}
        stages={stages.map((option) => ({ id: option.id, name: option.name }))}
        areas={areas.map((option) => ({ id: option.id, name: option.name }))}
        values={{
          headlineAr: profile.headlineAr ?? "",
          headlineEn: profile.headlineEn ?? "",
          bioAr: profile.bioAr ?? "",
          bioEn: profile.bioEn ?? "",
          qualification: profile.qualification ?? "",
          university: profile.university ?? "",
          major: profile.major ?? "",
          graduationYear: profile.graduationYear,
          yearsExperience: profile.yearsExperience,
          pricePerHour: profile.pricePerHour,
          teachesHome: profile.teachesHome,
          teachesOnline: profile.teachesOnline,
          gender: profile.gender,
          areaId: profile.areaId,
          areaIds: profile.areaIds,
          subjectIds: profile.subjectIds,
          stageIds: profile.stageIds,
          languages: profile.languages,
        }}
      />
    </div>
  );
}
