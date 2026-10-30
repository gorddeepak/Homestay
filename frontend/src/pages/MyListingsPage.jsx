import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";

import { deleteListing, getMyListings } from "../api";
import { useAuth } from "../auth";
import ListingImage from "../components/ListingImage";
import { formatPrice } from "../format";

function MyListingsSkeleton() {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }, (_, index) => (
        <div
          key={index}
          className="overflow-hidden rounded-3xl border border-clay bg-white/60"
        >
          <div className="aspect-[4/3] animate-pulse bg-clay" />
          <div className="space-y-2 p-4">
            <div className="h-2.5 w-1/3 animate-pulse rounded bg-clay" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-clay" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-clay" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function MyListingsPage() {
  const { user, status: authStatus } = useAuth();
  const [listings, setListings] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [deletingId, setDeletingId] = useState(null);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    if (!user) {
      return undefined;
    }

    let active = true;
    setStatus("loading");
    setError("");

    getMyListings()
      .then((data) => {
        if (!active) return;
        setListings(data);
        setStatus("ready");
      })
      .catch((requestError) => {
        if (!active) return;
        setError(requestError.message);
        setStatus("error");
      });

    return () => {
      active = false;
    };
  }, [user, reloadKey]);

  if (authStatus === "loading") {
    return (
      <p className="mx-auto max-w-md px-4 py-24 text-center text-sm text-sand">
        Checking your session…
      </p>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  async function handleDelete(listing) {
    const title = listing.title || "this listing";
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) {
      return;
    }

    setActionError("");
    setDeletingId(listing.id);
    try {
      await deleteListing(listing.id);
      setListings((current) =>
        current.filter((item) => item.id !== listing.id),
      );
    } catch (requestError) {
      setActionError(requestError.message);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sand">
            Hosting
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold text-ink sm:text-4xl">
            My listings
          </h1>
          <p className="mt-2 text-sm text-sand">
            Stays you have published as @{user.username}.
          </p>
        </div>
        <Link
          to="/listings/new"
          className="rounded-full bg-earth px-5 py-3 text-sm font-semibold text-linen transition hover:bg-ink"
        >
          Create a listing
        </Link>
      </div>

      {actionError && (
        <p
          role="alert"
          className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {actionError}
        </p>
      )}

      <div className="mt-8">
        {status === "loading" && <MyListingsSkeleton />}

        {status === "error" && (
          <div className="rounded-3xl border border-clay bg-white/60 px-6 py-14 text-center">
            <p className="font-display text-xl font-semibold text-ink">
              We couldn't load your listings
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm text-sand">
              {error || "The listings API is unavailable."}
            </p>
            <button
              type="button"
              onClick={() => setReloadKey((key) => key + 1)}
              className="mt-6 rounded-full bg-earth px-6 py-3 text-sm font-semibold text-linen transition hover:bg-ink"
            >
              Try again
            </button>
          </div>
        )}

        {status === "ready" &&
          (listings.length === 0 ? (
            <div className="rounded-3xl border border-clay bg-white/60 px-6 py-14 text-center">
              <p className="font-display text-xl font-semibold text-ink">
                You haven't published a stay yet.
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm text-sand">
                Add your first listing to start hosting.
              </p>
              <Link
                to="/listings/new"
                className="mt-6 inline-block rounded-full bg-earth px-6 py-3 text-sm font-semibold text-linen transition hover:bg-ink"
              >
                Create a listing
              </Link>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {listings.map((listing) => {
                const location = [listing.location, listing.country]
                  .filter(Boolean)
                  .join(", ");
                const deleting = deletingId === listing.id;

                return (
                  <article
                    key={listing.id}
                    className="overflow-hidden rounded-3xl border border-clay bg-white/60"
                  >
                    <Link
                      to={`/listings/${listing.id}`}
                      className="block aspect-[4/3] bg-clay"
                    >
                      <ListingImage
                        src={listing.image_url}
                        alt={listing.title || "EazyInvites listing"}
                        className="h-full w-full object-cover"
                      />
                    </Link>

                    <div className="p-4">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sand">
                        {listing.category || "Uncategorized"}
                      </p>
                      <h2 className="mt-1 truncate font-display text-base font-semibold text-ink">
                        {listing.title || "Untitled stay"}
                      </h2>
                      <p className="mt-1 truncate text-xs text-sand">
                        {location || "Location unavailable"}
                      </p>
                      <p className="mt-2 text-sm font-semibold text-earth">
                        {formatPrice(listing.price)}
                      </p>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <Link
                          to={`/listings/${listing.id}`}
                          className="rounded-full border border-clay px-4 py-2 text-xs font-semibold text-earth transition hover:border-sand"
                        >
                          View
                        </Link>
                        <Link
                          to={`/listings/${listing.id}/edit`}
                          className="rounded-full border border-clay px-4 py-2 text-xs font-semibold text-earth transition hover:border-sand"
                        >
                          Edit
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDelete(listing)}
                          disabled={deleting}
                          className="rounded-full border border-red-200 px-4 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {deleting ? "Deleting…" : "Delete"}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ))}
      </div>
    </div>
  );
}
