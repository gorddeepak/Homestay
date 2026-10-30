import { useState } from "react";

export default function ListingImage({ src, alt, className = "" }) {
  const [failedSrc, setFailedSrc] = useState(null);

  if (!src || failedSrc === src) {
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
      src={src}
      alt={alt}
      className={className}
      onError={() => setFailedSrc(src)}
    />
  );
}
