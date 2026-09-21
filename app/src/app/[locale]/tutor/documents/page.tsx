import { UploadForm } from "@/components/forms/UploadForm";
import { StatusPill } from "@/components/admin/ui";
import { requirePageSession } from "@/lib/auth/server";
import { listTutorDocuments } from "@/lib/documents/service";
import { dbConfigured } from "@/lib/db";
import { createTranslator, formatDateTime, resolveLocale, type DictKey } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const KIND_KEYS: Record<string, DictKey> = {
  identity: "tutor.documents.kind.identity",
  degree: "tutor.documents.kind.degree",
  certificate: "tutor.documents.kind.certificate",
  experience: "tutor.documents.kind.experience",
  other: "tutor.documents.kind.other",
};

/**
 * /[locale]/tutor/documents (§7.2, §21).
 *
 * The tutor uploads and sees the REVIEW STATE of each document - never a link
 * to it. Documents live in a private bucket and are readable only by an admin
 * through an audited, short-lived URL, which is why this screen lists metadata
 * and nothing else.
 */
export default async function TutorDocumentsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = resolveLocale(rawLocale);
  const gate = await requirePageSession({ requireTutor: true });
  const t = createTranslator(locale);
  if (!gate.ok) return null;

  const documents = dbConfigured() ? await listTutorDocuments(gate.session.user.tutorId!).catch(() => []) : [];

  return (
    <div className="admin-section">
      <div className="stack-xs">
        <h1 className="display display--section" style={{ fontSize: "var(--text-h3)" }}>
          {t("tutor.documents.title")}
        </h1>
        <p className="field__hint">{t("tutor.documents.help")}</p>
      </div>

      <p className="notice notice--info">{t("tutor.documents.privacyNote")}</p>

      <UploadForm
        locale={locale}
        endpoint="/api/tutor/documents"
        title={t("tutor.documents.upload")}
        help={t("tutor.documents.required")}
        fields={[
          {
            kind: "select",
            name: "kind",
            label: t("tutor.documents.title"),
            value: "identity",
            options: (["identity", "degree", "certificate", "experience", "other"] as const).map((kind) => ({
              value: kind,
              label: t(KIND_KEYS[kind]!),
            })),
          },
        ]}
        fileLabel={t("tutor.documents.upload")}
        fileHelp={t("tutor.documents.privacyNote")}
        submitLabel={t("tutor.documents.upload")}
        successText={t("tutor.documents.uploaded")}
      />

      {documents.length === 0 ? (
        <div className="card stack-xs">
          <strong>{t("tutor.documents.empty")}</strong>
          <p className="soft">{t("tutor.documents.required")}</p>
        </div>
      ) : (
        <ul className="admin-list">
          {documents.map((document) => (
            <li key={document.id}>
              <div className="row--between" style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
                <strong>{t(KIND_KEYS[document.kind] ?? "tutor.documents.kind.other")}</strong>
                <StatusPill
                  tone={document.status === "approved" ? "ok" : document.status === "rejected" ? "danger" : "warn"}
                  label={t(`tutor.documents.status.${document.status}` as DictKey)}
                />
              </div>
              <span className="admin-meta">
                <span translate="no" className="tnum">
                  {document.mimeType}
                </span>
                <span className="tnum">{Math.round(document.sizeBytes / 1024)} KB</span>
                <time className="tnum" dateTime={new Date(document.createdAt).toISOString()}>
                  {formatDateTime(document.createdAt, locale)}
                </time>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
