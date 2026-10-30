import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";

import { aiSearch, getListings } from "../api";
import { LISTING_CATEGORIES } from "../categories";
import ListingCard from "../components/ListingCard";
import ListingImage from "../components/ListingImage";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { formatPrice } from "../format";

const CATEGORIES = ["All", ...LISTING_CATEGORIES];

function FeaturedStays({ listings }) {
  return (
    <section className="mx-auto max-w-7xl px-4 pt-12 sm:px-6">
      <div className="mb-5 flex items-end justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sand">
            Featured stays
          </p>
          <h2 className="mt-1 font-display text-2xl font-bold text-ink">
            Handpicked for you
          </h2>
        </div>
        <a
          href="#all-stays"
          className="text-sm font-semibold text-earth hover:text-ink"
        >
          View all
        </a>
      </div>

      <div className="grid gap-4 md:h-[50rem] md:grid-cols-4 md:grid-rows-2">
        {listings.map((listing, index) => {
          const location = [listing.location, listing.country]
            .filter(Boolean)
            .join(", ");
          const isLarge = index === 0;
          const isWide = index === 1;

          return (
            <Link
              key={listing.id}
              to={`/listings/${listing.id}`}
              className={`group relative aspect-square overflow-hidden rounded-2xl md:aspect-auto ${
                isLarge
                  ? "md:col-span-2 md:row-span-2"
                  : isWide
                    ? "md:col-span-2"
                    : ""
              }`}
            >
              <ListingImage
                src={listing.image_url}
                alt={listing.title || "EazyInvites listing"}
                className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-linear-to-t from-black/60 via-black/10 to-transparent" />
              <div className="absolute inset-x-4 bottom-4 text-linen sm:inset-x-5 sm:bottom-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-linen/75">
                  {location || "Location unavailable"}
                </p>
                <h3
                  className={`mt-1 font-display font-bold ${
                    isLarge ? "text-2xl" : isWide ? "text-xl" : "text-base"
                  }`}
                >
                  {listing.title || "Untitled stay"}
                </h3>
                <p className="mt-1 text-sm text-linen/85">
                  {formatPrice(listing.price)}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function filterSummary(filters) {
  const parts = [];
  if (filters.location) parts.push(`in ${filters.location}`);
  if (filters.country) parts.push(`in ${filters.country}`);
  if (filters.category) parts.push(filters.category);
  if (filters.min_price != null && filters.max_price != null) {
    parts.push(
      `₹${filters.min_price.toLocaleString("en-IN")}–₹${filters.max_price.toLocaleString("en-IN")}`
    );
  } else if (filters.max_price != null) {
    parts.push(`under ₹${filters.max_price.toLocaleString("en-IN")}`);
  } else if (filters.min_price != null) {
    parts.push(`from ₹${filters.min_price.toLocaleString("en-IN")}`);
  }
  return parts.join(" · ");
}

function LoadingGrid() {
  return (
    <div
      aria-label="Loading stays"
      className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-4"
    >
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index}>
          <div className="aspect-square animate-pulse rounded-2xl bg-clay" />
          <div className="mt-3 h-2.5 w-1/2 animate-pulse rounded bg-clay" />
          <div className="mt-2 h-3.5 w-3/4 animate-pulse rounded bg-clay" />
          <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-clay" />
        </div>
      ))}
    </div>
  );
}

export default function BrowsePage() {
  const [searchParams] = useSearchParams();
  const { hash } = useLocation();
  const categoryParam = searchParams.get("category");

  const [listings, setListings] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [category, setCategory] = useState(
    categoryParam && LISTING_CATEGORIES.includes(categoryParam)
      ? categoryParam
      : "All"
  );
  const [reloadKey, setReloadKey] = useState(0);

  // Footer links can deep-link into a category, e.g. /?category=Houseboat.
  useEffect(() => {
    if (categoryParam && LISTING_CATEGORIES.includes(categoryParam)) {
      setCategory(categoryParam);
    }
  }, [categoryParam]);

  // Deep links such as /?category=Houseboat#all-stays should land on the grid
  // once the listings, and the featured row above it, have rendered.
  useEffect(() => {
    if (status !== "ready" || hash !== "#all-stays") {
      return;
    }

    document
      .getElementById("all-stays")
      ?.scrollIntoView({ behavior: "instant", block: "start" });
  }, [status, hash, categoryParam]);

  const [aiQuery, setAiQuery] = useState("");
  const [aiStatus, setAiStatus] = useState("idle");
  const [aiError, setAiError] = useState("");
  const [aiResults, setAiResults] = useState(null);
  const [aiFilters, setAiFilters] = useState(null);

  useEffect(() => {
    let active = true;
    setStatus("loading");
    setError("");

    getListings()
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
  }, [reloadKey]);

  async function handleAiSearch(event) {
    event.preventDefault();
    const query = aiQuery.trim();
    if (!query || aiStatus === "loading") {
      return;
    }

    setAiStatus("loading");
    setAiError("");

    try {
      const data = await aiSearch(query);
      setAiResults(data.listings);
      setAiFilters(data.filters);
      setCategory("All");
      setAiStatus("ready");
      document
        .getElementById("all-stays")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (requestError) {
      setAiResults(null);
      setAiFilters(null);
      setAiError(requestError.message);
      setAiStatus("error");
    }
  }

  function clearAiSearch() {
    setAiQuery("");
    setAiResults(null);
    setAiFilters(null);
    setAiError("");
    setAiStatus("idle");
  }

  const sourceListings = aiResults ?? listings;
  const visibleListings =
    category === "All"
      ? sourceListings
      : sourceListings.filter((listing) => listing.category === category);

  return (
    <>
      <section className="relative -mt-16 flex min-h-screen items-center justify-center overflow-hidden">
        <img
          src="/images/hero-homestay.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-linear-to-b from-black/15 via-black/35 to-black/60" />
        <div className="relative mx-auto w-full max-w-6xl px-4 py-24 text-center text-linen sm:px-6">
          <p className="font-display text-4xl font-bold leading-none tracking-tight text-linen/90 sm:text-6xl lg:text-7xl">
            The world's finest homes
          </p>
          <h1 className="mt-1 font-display text-4xl font-bold leading-tight tracking-tight sm:text-6xl lg:text-7xl">
            yours to{" "}
            <em className="font-serif font-semibold italic text-sand">stay.</em>
          </h1>
          <a
            href="#all-stays"
            className="mt-10 inline-block rounded-full bg-linen px-8 py-3.5 text-sm font-semibold text-earth transition hover:-translate-y-0.5 hover:bg-clay"
          >
            Explore stays
          </a>
        </div>
      </section>

      {status === "ready" && listings.length >= 4 && (
        <FeaturedStays listings={listings.slice(0, 4)} />
      )}

      <section
        id="all-stays"
        className="mx-auto max-w-7xl scroll-mt-20 px-4 py-12 sm:px-6"
      >
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sand">
              {aiResults !== null ? "AI search" : "All stays"}
            </p>
            <h2 className="mt-1 font-display text-2xl font-bold text-ink sm:text-3xl">
              {aiResults !== null
                ? "Stays that match your search"
                : "Find your next escape"}
            </h2>
          </div>
          {status === "ready" && sourceListings.length > 0 && (
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sand">
              {visibleListings.length} stay
              {visibleListings.length === 1 ? "" : "s"}
            </p>
          )}
        </div>

        <form
          onSubmit={handleAiSearch}
          className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center"
        >
          <Input
            type="text"
            value={aiQuery}
            onChange={(event) => setAiQuery(event.target.value)}
            maxLength={300}
            aria-label="Describe the stay you are looking for"
            placeholder="Try “a quiet coastal stay under 5000”"
            className="h-11 flex-1 rounded-full border-clay bg-white/70 px-5 text-sm"
          />
          <Button
            type="submit"
            disabled={aiStatus === "loading" || !aiQuery.trim()}
            className="h-11 rounded-full bg-earth px-6 text-linen hover:bg-ink"
          >
            {aiStatus === "loading" ? "Searching…" : "AI search"}
          </Button>
          {aiResults !== null && (
            <Button
              type="button"
              variant="ghost"
              onClick={clearAiSearch}
              className="h-11 rounded-full px-4 text-earth"
            >
              Clear
            </Button>
          )}
        </form>

        {aiError && (
          <Alert variant="destructive" className="mb-5 border-red-200">
            <AlertTitle>Search unavailable</AlertTitle>
            <AlertDescription>{aiError}</AlertDescription>
          </Alert>
        )}

        {aiResults !== null && aiFilters && (
          <p className="mb-5 text-xs text-sand">
            Understood: {filterSummary(aiFilters) || "no specific criteria"}
          </p>
        )}

        <div className="no-scrollbar mb-7 flex gap-2 overflow-x-auto pb-2">
          {CATEGORIES.map((name) => {
            const active = category === name;
            return (
              <button
                key={name}
                type="button"
                onClick={() => setCategory(name)}
                className={`shrink-0 rounded-full border px-4 py-2 text-xs font-semibold transition ${
                  active
                    ? "border-earth bg-earth text-linen"
                    : "border-clay bg-white/60 text-earth hover:border-sand"
                }`}
              >
                {name}
              </button>
            );
          })}
        </div>

        {status === "loading" && <LoadingGrid />}

        {status === "error" && (
          <div className="rounded-3xl border border-clay bg-white/60 px-6 py-14 text-center">
            <p className="font-display text-xl font-semibold text-ink">
              We couldn't load the stays
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
          (visibleListings.length === 0 ? (
            <div className="rounded-3xl border border-clay bg-white/60 px-6 py-14 text-center">
              <p className="font-display text-xl font-semibold text-ink">
                {aiResults !== null
                  ? aiResults.length === 0
                    ? "No stays matched your search."
                    : `No stays in ${category} for this search.`
                  : listings.length === 0
                    ? "No stays are available yet."
                    : `No stays in ${category} yet.`}
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm text-sand">
                {aiResults !== null
                  ? aiResults.length === 0
                    ? "Try a different description, or clear the search to browse every stay."
                    : "Try another category or browse every result."
                  : listings.length === 0
                    ? "Check back once hosts publish their homes."
                    : "Try another category or browse every stay."}
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                {category !== "All" && (
                  <button
                    type="button"
                    onClick={() => setCategory("All")}
                    className="rounded-full bg-earth px-6 py-3 text-sm font-semibold text-linen transition hover:bg-ink"
                  >
                    Show all categories
                  </button>
                )}
                {aiResults !== null && (
                  <button
                    type="button"
                    onClick={clearAiSearch}
                    className="rounded-full border border-clay px-6 py-3 text-sm font-semibold text-earth transition hover:border-sand"
                  >
                    Clear AI search
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
              {visibleListings.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          ))}
      </section>
    </>
  );
}
