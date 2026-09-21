import type { Option } from "@/lib/data/catalog";

export interface HeroSearchProps {
  /** the form posts to /<locale>/tutors; the locale is baked into the action */
  action: string;
  subjects: Option[];
  stages: Option[];
  areas: Option[];
  labels: {
    subject: string;
    stage: string;
    area: string;
    subjectPlaceholder: string;
    stagePlaceholder: string;
    areaPlaceholder: string;
    submit: string;
  };
}

/**
 * The hero search strip is a plain GET form: it works with JavaScript disabled,
 * the result is a shareable URL (/tutors?subject=…&area=…), and there is no
 * client state to hydrate.
 */
export function HeroSearch({ action, subjects, stages, areas, labels }: HeroSearchProps) {
  return (
    <div className="shell hero__search">
      <form className="search-strip" action={action} method="get" role="search">
        <div className="search-strip__field">
          <label htmlFor="hero-subject" className="label">
            {labels.subject}
          </label>
          <select id="hero-subject" name="subject" className="select" defaultValue="">
            <option value="">{labels.subjectPlaceholder}</option>
            {subjects.map((option) => (
              <option key={option.id} value={option.code}>
                {option.name}
              </option>
            ))}
          </select>
        </div>

        <div className="search-strip__field">
          <label htmlFor="hero-stage" className="label">
            {labels.stage}
          </label>
          <select id="hero-stage" name="stage" className="select" defaultValue="">
            <option value="">{labels.stagePlaceholder}</option>
            {stages.map((option) => (
              <option key={option.id} value={option.code}>
                {option.name}
              </option>
            ))}
          </select>
        </div>

        <div className="search-strip__field">
          <label htmlFor="hero-area" className="label">
            {labels.area}
          </label>
          <select id="hero-area" name="area" className="select" defaultValue="">
            <option value="">{labels.areaPlaceholder}</option>
            {areas.map((option) => (
              <option key={option.id} value={option.code}>
                {option.name}
              </option>
            ))}
          </select>
        </div>

        <div className="search-strip__action">
          <button type="submit" className="btn btn--primary btn--lg" style={{ width: "100%" }}>
            {labels.submit}
          </button>
        </div>
      </form>
    </div>
  );
}
