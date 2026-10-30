import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { deleteListing, getListing } from "../api";
import { useAuth } from "../auth";
import ListingImage from "../components/ListingImage";
import ReviewsSection from "../components/ReviewsSection";
import { formatPrice } from "../format";

// MapLibre is large, so it is only downloaded when a detail page needs it.
const ListingMap = lazy(() => import("../components/ListingMap"));

function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-7xl animate-pulse px-4 py-8 sm:px-6">
      <div className="h-3 w-40 rounded bg-clay" />
      <div className="mt-6 h-3 w-24 rounded bg-clay" />
      <div className="mt-3 h-10 w-2/3 rounded bg-clay" />
      <div className="mt-3 h-4 w-1/3 rounded bg-clay" />
      <div className="mt-6 aspect-[16/9] rounded-3xl bg-clay" />
      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-3">
          <div className="h-6 w-1/3 rounded bg-clay" />
          <div className="h-4 w-full rounded bg-clay" />
          <div className="h-4 w-5/6 rounded bg-clay" />
          <div className="h-24 w-full rounded-2xl bg-clay" />
        </div>
        <div className="h-56 rounded-3xl bg-clay" />
      </div>
    </div>
  );
}

export default function DetailPage() {
  const { listingId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [listing, setListing] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    let active = true;
    setStatus("loading");
    setError(null);

    getListing(listingId)
      .then((data) => {
        if (!active) return;
        setListing(data);
        setStatus("ready");
      })
      .catch((requestError) => {
        if (!active) return;
        setError(requestError);
        setStatus("error");
      });

    return () => {
      active = false;
    };
  }, [listingId, reloadKey]);

  if (status === "loading") {
    return <DetailSkeleton />;
  }

  if (status === "error") {
    const notFound = error.status === 400 || error.status === 404;

    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sand">
          {notFound ? "Stay not found" : "Unable to load stay"}
        </p>
        <h1 className="mt-3 font-display text-3xl font-bold text-ink">
          {notFound
            ? "We couldn't find that stay."
            : "We couldn't load this stay."}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-sand">
          {notFound
            ? "It may have been removed, or the link may be incorrect."
            : error.message || "The listings API is unavailable."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {!notFound && (
            <button
              type="button"
              onClick={() => setReloadKey((key) => key + 1)}
              className="rounded-full bg-earth px-6 py-3 text-sm font-semibold text-linen transition hover:bg-ink"
            >
              Try again
            </button>
          )}
          <Link
            to="/"
            className={`rounded-full px-6 py-3 text-sm font-semibold transition ${
              notFound
                ? "bg-earth text-linen hover:bg-ink"
                : "border border-clay bg-white/60 text-earth hover:border-sand"
            }`}
          >
            Browse all stays
          </Link>
        </div>
      </div>
    );
  }

  const title = listing.title || "Untitled stay";
  const category = listing.category || "Uncategorized";
  const location = [listing.location, listing.country]
    .filter(Boolean)
    .join(", ");
  const hostName = listing.owner?.username;
  // Convenience only: the API re-checks ownership on every mutation.
  const isOwner = Boolean(user && listing.owner && listing.owner.id === user.id);

  async function handleDelete() {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) {
      return;
    }

    setDeleteError("");
    setDeleting(true);
    try {
      await deleteListing(listing.id);
      navigate("/my-listings", { replace: true });
    } catch (requestError) {
      setDeleteError(requestError.message);
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sand">
        <Link to="/" className="hover:text-earth">
          Stays
        </Link>
        <span className="px-2">/</span>
        {category}
        <span className="px-2">/</span>
        <span className="text-earth">{title}</span>
      </p>

      <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.2em] text-sand">
        {category}
      </p>
      <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-ink sm:text-5xl">
        {title}
      </h1>
      <p className="mt-2 text-sm text-sand">
        {location || "Location unavailable"}
      </p>

      {isOwner && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Link
            to={`/listings/${listing.id}/edit`}
            className="rounded-full bg-earth px-5 py-2 text-sm font-semibold text-linen transition hover:bg-ink"
          >
            Edit listing
          </Link>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-full border border-red-200 px-5 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {deleting ? "Deleting…" : "Delete listing"}
          </button>
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-sand">
            You host this stay
          </span>
        </div>
      )}

      {deleteError && (
        <p
          role="alert"
          className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {deleteError}
        </p>
      )}

      <div className="mt-6 aspect-[16/9] overflow-hidden rounded-3xl bg-clay">
        <ListingImage
          src={listing.image_url}
          alt={title}
          className="h-full w-full object-cover"
        />
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-clay font-display text-lg font-bold text-earth">
              {hostName ? hostName.charAt(0).toUpperCase() : "?"}
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sand">
                Hosted by
              </p>
              <p className="font-semibold text-earth">
                {hostName ? `@${hostName}` : "Host information unavailable"}
              </p>
            </div>
          </div>

          <h2 className="mt-8 font-display text-xl font-bold text-ink">
            About this stay
          </h2>
          <p className="mt-2 leading-7 text-earth/80">
            {listing.description || "No description provided."}
          </p>

          <dl className="mt-8 grid grid-cols-2 gap-4 rounded-2xl bg-clay/60 p-5 sm:grid-cols-3">
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-[0.16em] text-sand">
                Category
              </dt>
              <dd className="mt-1 text-sm font-semibold text-earth">
                {category}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-[0.16em] text-sand">
                Country
              </dt>
              <dd className="mt-1 text-sm font-semibold text-earth">
                {listing.country || "Not provided"}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-[0.16em] text-sand">
                Location
              </dt>
              <dd className="mt-1 text-sm font-semibold text-earth">
                {listing.location || "Not provided"}
              </dd>
            </div>
          </dl>
        </div>

        <aside className="h-fit rounded-3xl border border-clay bg-white/70 p-6 shadow-sm">
          <p className="font-display text-2xl font-bold text-ink">
            {formatPrice(listing.price)}
          </p>
          <p className="mt-1 text-xs text-sand">
            Contact host for availability
          </p>
          <hr className="my-5 border-clay" />
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sand">
            Located in
          </p>
          <p className="mt-1 font-semibold text-earth">
            {location || "Location unavailable"}
          </p>
        </aside>
      </div>

      <Suspense
        fallback={
          <div className="mt-10 h-[28rem] animate-pulse rounded-3xl bg-clay" />
        }
      >
        <ListingMap geometry={listing.geometry} location={location} />
      </Suspense>

      <ReviewsSection listingId={listing.id} />
    </div>
  );
}
