import { Tag } from "lucide-react";
import { Link } from "react-router-dom";

import { formatPrice } from "../format";
import ListingImage from "./ListingImage";

export default function ListingCard({ listing }) {
  const location = [listing.location, listing.country]
    .filter(Boolean)
    .join(", ");

  return (
    <Link to={`/listings/${listing.id}`} className="group block">
      <div className="relative aspect-square overflow-hidden rounded-2xl bg-clay">
        <ListingImage
          src={listing.image_url}
          alt={listing.title || "EazyInvites listing"}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white backdrop-blur">
          <Tag className="size-3" />
          {listing.category || "Uncategorized"}
        </span>
      </div>

      <div className="pt-2.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sand">
          {location || "Location unavailable"}
        </p>
        <h3 className="mt-1 font-display text-base font-bold leading-snug text-earth">
          {listing.title || "Untitled stay"}
        </h3>
        <p className="mt-0.5 text-sm font-medium text-earth">
          {formatPrice(listing.price)}
        </p>
      </div>
    </Link>
  );
}
