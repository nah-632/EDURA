import type { Metadata } from "next";

import { TutorCard } from "@/components/tutors/TutorCard";
import { createTranslator, type Locale } from "@/lib/i18n";
import { listAreas, listStages, listSubjects } from "@/lib/data/catalog";
import { listPublicTutors, type TutorFilters } from "@/lib/data/tutors";

export const revalidate = 30;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = createTranslator(locale as Locale);
  return {
    title: t("search.title"),
    description: t("search.subtitle"),
    alternates: { canonical: `/${locale}/tutors` },
  };
}

type SearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/**
 * Rebuild the query string for a link that changes or removes one filter,
 * preserving everything else. Keeps every filtered view a real URL.
 */
function buildHref(locale: string, current: SearchParams, remove: string[] = [], set: Record<string, string> = {}): string {
  const usp = new URLSearchParams();
  for (const [key, raw] of Object.entries(current)) {
    if (remove.includes(key)) continue;
    const value = firstValue(raw);
    if (value) usp.set(key, value);
  }
  for (const [key, value] of Object.entries(set)) {
    if (value) usp.set(key, value);
    else usp.delete(key);
  }
  usp.delete("page");
  const qs = usp.toString();
  return `/${locale}/tutors${qs ? `?${qs}` : ""}`;
}

const SORTS = ["rating", "priceAsc", "priceDesc", "experience", "newest"] as const;

export default async function TutorsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale: rawLocale } = await params;
  const query = await searchParams;
  const locale = rawLocale as Locale;
  const t = createTranslator(locale);

  const sortParam = firstValue(query.sort);
  const filters: TutorFilters = {
    subject: firstValue(query.subject),
    stage: firstValue(query.stage),
    area: firstValue(query.area),
    method: firstValue(query.method) === "home" ? "home" : firstValue(query.method) === "online" ? "online" : undefined,
    minPrice: firstValue(query.minPrice),
    maxPrice: firstValue(query.maxPrice),
    minRating: firstValue(query.minRating) ? Number(firstValue(query.minRating)) : undefined,
    minExperience: firstValue(query.minExperience) ? Number(firstValue(query.minExperience)) : undefined,
    sort: (SORTS as readonly string[]).includes(sortParam ?? "") ? (sortParam as TutorFilters["sort"]) : "rating",
    limit: 12,
    offset: firstValue(query.page) ? Math.max(0, (Number(firstValue(query.page)) - 1) * 12) : 0,
  };

  const [subjects, stages, areas, tutors] = await Promise.all([
    listSubjects(locale),
    listStages(locale),
    listAreas(locale),
    listPublicTutors(locale, filters),
  ]);

  const applied = [
    filters.subject && { key: "subject", label: t("search.subject"), value: subjects.find((s) => s.code === filters.subject)?.name ?? filters.subject },
    filters.stage && { key: "stage", label: t("search.stage"), value: stages.find((s) => s.code === filters.stage)?.name ?? filters.stage },
    filters.area && { key: "area", label: t("search.area"), value: areas.find((a) => a.code === filters.area)?.name ?? filters.area },
    filters.method && { key: "method", label: t("search.method"), value: filters.method === "home" ? t("search.method.home") : t("search.method.online") },
    filters.minRating && { key: "minRating", label: t("search.minRating"), value: `${filters.minRating}+` },
    filters.minExperience && { key: "minExperience", label: t("search.minExperience"), value: `${filters.minExperience}+` },
  ].filter(Boolean) as { key: string; label: string; value: string }[];

  const countLabel = tutors.length === 1 ? t("search.countOne") : t("search.count", { count: tutors.length });

  return (
    <>
      <section className="section section--tight" style={{ background: "#fff", borderBlockEnd: "1px solid var(--line)" }}>
        <div className="shell stack-sm">
          <h1 className="display display--section">{t("search.title")}</h1>
          <p className="lead">{t("search.subtitle")}</p>
        </div>
      </section>

      <section className="section">
        <div className="shell search-layout">
          {/* Filters are a GET form: every filter combination is a real,
              shareable URL and the page works without JavaScript. */}
          <form className="panel search-filters" method="get" action={`/${locale}/tutors`} role="search">
            <div className="panel__head">
              <strong>{t("label.filters")}</strong>
              <a className="btn btn--quiet btn--sm" href={`/${locale}/tutors`}>
                {t("cta.resetFilters")}
              </a>
            </div>
            <div className="panel__body stack-sm">
              <div className="field">
                <label className="label" htmlFor="f-q">
                  {t("label.search")}
                </label>
                <input
                  id="f-q"
                  name="q"
                  type="search"
                  className="input"
                  placeholder={t("search.queryPlaceholder")}
                  defaultValue={firstValue(query.q) ?? ""}
                  disabled
                  aria-describedby="f-q-hint"
                />
                <span className="field__hint" id="f-q-hint">
                  {t("state.comingSoon")}
                </span>
              </div>

              <div className="field">
                <label className="label" htmlFor="f-subject">
                  {t("search.subject")}
                </label>
                <select id="f-subject" name="subject" className="select" defaultValue={filters.subject ?? ""}>
                  <option value="">{t("label.all")}</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.code}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label className="label" htmlFor="f-stage">
                  {t("search.stage")}
                </label>
                <select id="f-stage" name="stage" className="select" defaultValue={filters.stage ?? ""}>
                  <option value="">{t("label.all")}</option>
                  {stages.map((s) => (
                    <option key={s.id} value={s.code}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label className="label" htmlFor="f-area">
                  {t("search.area")}
                </label>
                <select id="f-area" name="area" className="select" defaultValue={filters.area ?? ""}>
                  <option value="">{t("label.all")}</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.code}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="label">{t("search.method")}</legend>
                <div className="row" style={{ gap: "0.4rem" }}>
                  {[
                    { value: "", label: t("label.all") },
                    { value: "home", label: t("search.method.home") },
                    { value: "online", label: t("search.method.online") },
                  ].map((option) => (
                    <label key={option.value || "any"} className="chip" style={{ cursor: "pointer" }}>
                      <input
                        type="radio"
                        name="method"
                        value={option.value}
                        defaultChecked={(filters.method ?? "") === option.value}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="field">
                <label className="label" htmlFor="f-minRating">
                  {t("search.minRating")}
                </label>
                <select id="f-minRating" name="minRating" className="select" defaultValue={filters.minRating?.toString() ?? ""}>
                  <option value="">{t("label.all")}</option>
                  {[3, 4, 4.5].map((value) => (
                    <option key={value} value={value}>
                      {value}+
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label className="label" htmlFor="f-minExperience">
                  {t("search.minExperience")}
                </label>
                <select
                  id="f-minExperience"
                  name="minExperience"
                  className="select"
                  defaultValue={filters.minExperience?.toString() ?? ""}
                >
                  <option value="">{t("label.all")}</option>
                  {[2, 5, 10].map((value) => (
                    <option key={value} value={value}>
                      {value}+
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <div className="field">
                  <label className="label" htmlFor="f-minPrice">
                    {t("search.priceMin")}
                  </label>
                  <input id="f-minPrice" name="minPrice" inputMode="decimal" className="input" defaultValue={filters.minPrice ?? ""} placeholder="2.000" />
                </div>
                <div className="field">
                  <label className="label" htmlFor="f-maxPrice">
                    {t("search.priceMax")}
                  </label>
                  <input id="f-maxPrice" name="maxPrice" inputMode="decimal" className="input" defaultValue={filters.maxPrice ?? ""} placeholder="15.000" />
                </div>
              </div>

              <div className="field">
                <label className="label" htmlFor="f-sort">
                  {t("search.sortLabel")}
                </label>
                <select id="f-sort" name="sort" className="select" defaultValue={filters.sort}>
                  <option value="rating">{t("search.sort.rating")}</option>
                  <option value="priceAsc">{t("search.sort.priceAsc")}</option>
                  <option value="priceDesc">{t("search.sort.priceDesc")}</option>
                  <option value="experience">{t("search.sort.experience")}</option>
                  <option value="newest">{t("search.sort.newest")}</option>
                </select>
              </div>

              <button type="submit" className="btn btn--primary">
                {t("cta.search")}
              </button>
            </div>
          </form>

          <div className="stack">
            <div className="row row--between">
              <strong className="tnum" aria-live="polite">
                {countLabel}
              </strong>
              {applied.length > 0 ? (
                <div className="row" style={{ gap: "0.4rem" }}>
                  {applied.map((chip) => (
                    <a key={chip.key} className="chip chip--pale" href={buildHref(locale, query, [chip.key])}>
                      {chip.label}: {chip.value} ×
                    </a>
                  ))}
                </div>
              ) : null}
            </div>

            {tutors.length === 0 ? (
              <div className="card stack-sm">
                <h2 style={{ fontSize: "1.1rem" }}>{t("state.noResultsTitle")}</h2>
                <p className="soft">{t("state.noResultsBody")}</p>
                <a className="btn btn--outline btn--sm" href={`/${locale}/tutors`} style={{ justifySelf: "start" }}>
                  {t("cta.resetFilters")}
                </a>
              </div>
            ) : (
              <div className="grid grid--2">
                {tutors.map((tutor) => (
                  <TutorCard key={tutor.id} locale={locale} tutor={tutor} />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
