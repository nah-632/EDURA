import { StudentManager } from "@/components/account/StudentManager";
import { requirePageSession } from "@/lib/auth/server";
import { listStages } from "@/lib/data/catalog";
import { listStudents } from "@/lib/students/service";
import { dbConfigured } from "@/lib/db";
import { createTranslator, resolveLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * /[locale]/dashboard/students (§7.1).
 *
 * Student records are the platform's minor-data category: used to run a lesson,
 * never shown on a public page, anonymised on deletion. The screen states that
 * rather than leaving the parent to infer it.
 */
export default async function StudentsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = resolveLocale(rawLocale);
  const gate = await requirePageSession();
  const t = createTranslator(locale);

  const stages = await listStages(locale);
  const students = gate.ok && dbConfigured() ? await listStudents(gate.session.user.id).catch(() => []) : [];

  return (
    <div className="admin-section">
      <div className="stack-xs">
        <h1 className="display display--section" style={{ fontSize: "var(--text-h3)" }}>
          {t("students.title")}
        </h1>
        <p className="field__hint">{t("students.subtitle")}</p>
      </div>

      <StudentManager
        locale={locale}
        stages={stages.map((stage) => ({ id: stage.id, name: stage.name }))}
        currentYear={new Date().getFullYear()}
        students={students.map((student) => ({
          id: student.id,
          fullName: student.fullName,
          stageId: student.stageId,
          stageName: student.stageName,
          grade: student.grade,
          gender: student.gender,
          birthYear: student.birthYear,
          notes: student.notes,
        }))}
      />
    </div>
  );
}
