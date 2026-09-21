// Preview stub for next/link: renders a plain anchor with the same props.
import React from "react";
export default function Link({ href, children, ...rest }) {
  const url = typeof href === "string" ? href : (href && href.pathname) || "#";
  const { replace, scroll, prefetch, passHref, legacyBehavior, locale, ...anchorProps } = rest;
  return React.createElement("a", { href: url, ...anchorProps }, children);
}
