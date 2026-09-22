import { cmsText, readCmsContent } from "@/lib/cms/public";
import type { Locale } from "@/lib/i18n";

/**
 * Promo banner (§15 CMS, operator request).
 *
 * The text, and whether it shows at all, are admin-editable CMS fields — the
 * point being that the operator can announce a launch offer, a Ramadan
 * schedule or a holiday notice without a deploy.
 *
 * Rendered above the header and inside the first paint so it is genuinely
 * prominent rather than a paragraph buried in the footer. It is a server
 * component with no state: a dismiss button would need client JS and a stored
 * preference, and a banner the operator switched on is meant to be seen.
 */
export async function PromoBanner({ locale }: { locale: Locale }) {
  const cms = await readCmsContent();
  if (!cms.promoActive) return null;

  const text = cmsText(cms, "promoBanner", locale, "");
  if (!text) return null;

  return (
    <div className="promo-banner" role="status">
      <div className="shell promo-banner__inner">
        <span className="promo-banner__dot" aria-hidden="true" />
        <p className="promo-banner__text">{text}</p>
      </div>
    </div>
  );
}
