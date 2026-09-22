import Link from "next/link";

import { EduraMark } from "@/components/brand/EduraLogo";

/**
 * Empty state.
 *
 * Revision 2026-09-22: the previous one was a white box with a thin border, a
 * bold sentence and a grey paragraph — clinical, and identical everywhere from
 * the admin console to the public homepage. An empty list is a normal thing to
 * arrive at (a new marketplace is empty on purpose), so it gets a considered
 * composition instead: the brand mark as an anchor, a short title, one
 * sentence, and — where there is one — the action that fills the space.
 *
 * `tone="paper"` is the default warm surface; `tone="plain"` drops the tint for
 * dense console screens where a decorative panel would be noise.
 */
export function EmptyState({
  title,
  body,
  action,
  tone = "paper",
}: {
  title: string;
  body?: string;
  action?: { href: string; label: string };
  tone?: "paper" | "plain";
}) {
  return (
    <div className={`empty-state empty-state--${tone}`}>
      <span className="empty-state__mark" aria-hidden="true">
        <EduraMark height={40} />
      </span>
      <strong className="empty-state__title">{title}</strong>
      {body ? <p className="empty-state__body">{body}</p> : null}
      {action ? (
        <Link className="btn btn--primary btn--sm" href={action.href}>
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
