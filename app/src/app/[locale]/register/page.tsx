import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { AuthForm } from "@/components/auth/AuthForm";
import { sessionFromCookieHeader } from "@/lib/auth/service";
import { createTranslator, type Locale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = createTranslator(locale as Locale);
  return { title: t("auth.register.title"), robots: { index: false } };
}

export default async function RegisterPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = rawLocale as Locale;
  const t = createTranslator(locale);

  const session = await sessionFromCookieHeader((await headers()).get("cookie"));
  if (session) redirect(`/${locale}/${session.kind === "admin" ? "admin" : session.user.tutorId ? "tutor" : "dashboard"}`);

  return (
    <section className="section">
      <div className="shell auth-layout">
        <div className="stack-sm">
          <h2 className="display display--section">{t("auth.welcome")}</h2>
          <p className="lead">{t("brand.statement")}</p>
        </div>

        <AuthForm
          mode="register"
          locale={locale}
          labels={{
            titleLogin: t("auth.login.title"),
            titleRegister: t("auth.register.title"),
            fullName: t("auth.fullName"),
            email: t("auth.email"),
            phone: t("auth.phone"),
            phoneHelp: t("auth.phoneHelp"),
            password: t("auth.password"),
            passwordConfirm: t("auth.passwordConfirm"),
            accountType: t("auth.accountType"),
            accountStudent: t("auth.accountType.student"),
            accountTutor: t("auth.accountType.tutor"),
            acceptTerms: t("booking.terms.accept"),
            termsLink: t("booking.terms.link"),
            mfaCode: t("auth.mfaCode"),
            mfaHelp: t("auth.mfaHelp"),
            submitLogin: t("auth.submitLogin"),
            submitRegister: t("auth.submitRegister"),
            submitting: t("state.saving"),
            noAccount: t("auth.noAccount"),
            haveAccount: t("auth.haveAccount"),
            registerLink: t("nav.register"),
            loginLink: t("nav.login"),
            guestNote: t("auth.guestBrowsing"),
            v_required: t("validation.required"),
            v_email: t("validation.email"),
            v_phone: t("validation.phone"),
            v_passwordMin: t("validation.passwordMin", { min: 10 }),
            v_passwordComplexity: t("validation.passwordComplexity"),
            v_passwordMismatch: t("validation.passwordMismatch"),
            v_terms: t("validation.terms"),
            e_invalid_credentials: t("auth.invalidCredentials"),
            e_account_suspended: t("auth.suspended"),
            e_account_locked: t("error.rateLimited"),
            e_mfa_required: t("auth.mfaRequired"),
            e_mfa_invalid: t("auth.mfaInvalid"),
            e_rate_limited: t("error.rateLimited"),
            e_validation: t("error.validation"),
            e_network: t("error.network"),
            e_unexpected: t("error.unexpected"),
          }}
        />
      </div>
    </section>
  );
}
