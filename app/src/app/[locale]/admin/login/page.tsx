import { redirect } from "next/navigation";

import { AdminLoginForm } from "@/components/admin/AdminLoginForm";
import { adminContext } from "@/lib/admin/guard";
import { createTranslator, resolveLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * /[locale]/admin/login
 *
 * A signed-in admin is sent straight to the console: showing a sign-in form to
 * someone who is already signed in is how "why is it asking me again?" support
 * tickets start.
 */
export default async function AdminLoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = resolveLocale(rawLocale);
  const ctx = await adminContext();
  if (ctx) redirect(`/${locale}/admin`);

  const t = createTranslator(locale);

  return (
    <section className="section">
      <div className="shell" style={{ maxWidth: "34rem" }}>
        <AdminLoginForm locale={locale} />
        <p className="notice notice--info" style={{ marginBlockStart: "1rem" }}>
          {t("admin.mfaSetupBody")}
        </p>
      </div>
    </section>
  );
}
