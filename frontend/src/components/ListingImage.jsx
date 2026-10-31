import { useState } from "react";

import { apiUrl } from "../apiUrl";

function resolveImageSrc(src) {
  if (typeof src !== "string") {
    return src;
  }
  // Backend-relative paths such as /images/manali.png live on the API origin.
  // Absolute and protocol-relative URLs are already complete.
  if (src.startsWith("/") && !src.startsWith("//")) {
    return apiUrl(src);
  }
  return src;
}

export default function ListingImage({ src, alt, className = "" }) {
  const [failedSrc, setFailedSrc] = useState(null);
  const resolvedSrc = resolveImageSrc(src);

  if (!resolvedSrc || failedSrc === resolvedSrc) {
    return (
      <div
        className={`flex items-center justify-center bg-clay px-4 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-sand ${className}`}
      >
        Image unavailable
      </div>
    );
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      className={className}
      onError={() => setFailedSrc(resolvedSrc)}
    />
  );
}
