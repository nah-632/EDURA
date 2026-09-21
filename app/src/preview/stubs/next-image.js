import React from "react";
export default function Image({ src, alt, fill, width, height, className, sizes, priority, loading, ...rest }) {
  const dims = fill ? { style: { position: "absolute", inset: 0, width: "100%", height: "100%" } } : { width, height };
  return React.createElement("img", { src: typeof src === "string" ? src : "", alt: alt ?? "", className, sizes, loading: priority ? "eager" : loading, ...dims, ...rest });
}
