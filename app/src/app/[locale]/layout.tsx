import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";

import { Header } from "@/components/layout/Header";
import { PromoBanner } from "@/components/layout/PromoBanner";
import { Footer } from "@/components/layout/Footer";
import { MotionRoot } from "@/components/motion/MotionRoot";
import { createTranslator, localeDir, localeMeta, locales, type Locale } from "@/lib/i18n";
import { currentSession } from "@/lib/auth/server";
import { getSettings } from "@/lib/settings";
import "@/styles/globals.css";

/**
 * Root layout.
 *
 * `app/[locale]/layout.tsx` IS the root layout (Next's i18n pattern): it owns
 * <html lang dir>, so the document direction is correct in the very first byte
 * of HTML - no client-side flipping, no RTL flash for Arabic visitors.
 */
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const typed = (locales as readonly string[]).includes(locale) ? (locale as Locale) : "ar";
  const t = createTranslator(typed);
  return {
    title: { default: t("brand.metaTitle"), template: `%s | ${t("brand.name")}` },
    description: t("brand.metaDescription"),
    applicationName: t("brand.name"),
    alternates: { canonical: `/${typed}`, languages: { ar: "/ar", en: "/en" } },
    manifest: "/manifest.webmanifest",
    icons: {
      icon: [
        { url: "/brand/icons/icon.svg", type: "image/svg+xml" },
        { url: "/brand/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
        { url: "/brand/icons/favicon-48.png", sizes: "48x48", type: "image/png" },
        { url: "/brand/icons/favicon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/brand/icons/favicon-512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: [{ url: "/brand/icons/apple-touch-icon.png", sizes: "180x180" }],
    },
    openGraph: {
      type: "website",
      siteName: t("brand.name"),
      title: t("brand.metaTitle"),
      description: t("brand.metaDescription"),
      locale: typed === "ar" ? "ar_BH" : "en_BH",
      images: [{ url: "/brand/og-image.png", width: 1200, height: 630,
                 alt: t("brand.tagline") }],
    },
  };
}

/**
 * The browser chrome colour. Matches the deep brand surface so the address bar
 * blends into the header on mobile, per locale-specific brand rules.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#17434A" },
    { media: "(prefers-color-scheme: dark)", color: "#0E2E33" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * Runs before the rest of the body is parsed, so the reveal state is decided
 * before first paint. Without JS - or with reduced motion - nothing is hidden.
 */
const MOTION_BOOTSTRAP = `try{if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches){document.documentElement.classList.add('has-motion')}}catch(e){}`;

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!(locales as readonly string[]).includes(locale)) notFound();
  const typedLocale = locale as Locale;
  const t = createTranslator(typedLocale);
  // The header reflects the real session: a signed-in customer must not be
  // shown "Sign in", and an admin must get a way into the console (§26).
  const [settings, session] = await Promise.all([getSettings(), currentSession()]);

  return (
    <html lang={localeMeta[typedLocale].htmlLang} dir={localeDir[typedLocale]} className="no-js">
      <body>
        {/* Preloads for the display faces that paint the hero headline: Fraunces
            for Latin, El Messiri for Arabic. The previous pair (Fraunces/Amiri)
            belonged to brand v1 and 404'd on every page load after the re-skin. */}
        <link
          rel="preload"
          href="/fonts/fraunces/6NU78FyLNQOQZAnv9bYEvDiIdE9Ea92uemAk_WBq8U_9v0c2Wa0KxC9TeP2Xz5c.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/el-messiri/K2F0fZBRmr9vQ1pHEey6MoiAAgDwbWu1jw.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <script dangerouslySetInnerHTML={{ __html: MOTION_BOOTSTRAP }} />

        <a className="skip-link" href="#main">
          {t("a11y.skipToContent")}
        </a>

        {/* Operator-controlled announcement. Renders nothing unless the CMS
            switch is on and a banner exists for this language. */}
        <PromoBanner locale={typedLocale} />

        <Header
          locale={typedLocale}
          signedIn={Boolean(session)}
          isAdmin={session?.kind === "admin"}
          isTutor={Boolean(session?.user.tutorId)}
        />

        <main id="main">{children}</main>

        <Footer
          locale={typedLocale}
          platformName={typedLocale === "ar" ? settings.platformNameAr : settings.platformNameEn}
          whatsappNumber={settings.whatsappNumber}
          supportEmail={settings.supportEmail}
        />

        <MotionRoot />
      </body>
    </html>
  );
}
