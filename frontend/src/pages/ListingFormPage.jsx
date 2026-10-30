import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";

import {
  createListing,
  deleteListingImage,
  generateDescription,
  getListing,
  updateListing,
  uploadImage,
} from "../api";
import { useAuth } from "../auth";
import { LISTING_CATEGORIES } from "../categories";
import ListingImage from "../components/ListingImage";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { Button } from "../components/ui/button";

const labelClass =
  "block text-[10px] font-bold uppercase tracking-[0.16em] text-sand";
const inputClass =
  "mt-1 w-full rounded-xl border border-clay bg-linen px-4 py-3 text-sm text-ink outline-none transition focus:border-earth";
const buttonClass =
  "rounded-full bg-earth px-6 py-3 text-sm font-semibold text-linen transition hover:bg-ink disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButtonClass =
  "rounded-full border border-clay px-5 py-2 text-sm font-semibold text-earth transition hover:border-sand disabled:cursor-not-allowed disabled:opacity-60";

// The provider accepts these formats and this size; the API re-checks both.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg"];

const EMPTY_FORM = {
  title: "",
  description: "",
  price: "",
  location: "",
  country: "",
  category: LISTING_CATEGORIES[0],
};

function FormSkeleton() {
  return (
    <div className="mx-auto max-w-2xl animate-pulse px-4 py-10 sm:px-6">
      <div className="h-3 w-20 rounded bg-clay" />
      <div className="mt-3 h-9 w-1/2 rounded bg-clay" />
      <div className="mt-8 space-y-5">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index}>
            <div className="h-2.5 w-24 rounded bg-clay" />
            <div className="mt-2 h-11 w-full rounded-xl bg-clay" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ListingFormPage() {
  const { listingId } = useParams();
  const editing = Boolean(listingId);
  const { user, status: authStatus } = useAuth();
  const navigate = useNavigate();

  const [loadStatus, setLoadStatus] = useState(editing ? "loading" : "ready");
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const [form, setForm] = useState(EMPTY_FORM);
  const [savedImageUrl, setSavedImageUrl] = useState(null);
  const [pendingImage, setPendingImage] = useState(null);

  const [uploading, setUploading] = useState(false);
  const [imageError, setImageError] = useState("");
  const [removingImage, setRemovingImage] = useState(false);

  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [aiStatus, setAiStatus] = useState("idle");
  const [aiError, setAiError] = useState("");
  const [aiSuggestion, setAiSuggestion] = useState("");

  useEffect(() => {
    if (!editing || !user) {
      return undefined;
    }

    let active = true;
    setLoadStatus("loading");
    setLoadError("");

    getListing(listingId)
      .then((listing) => {
        if (!active) return;

        if (!listing.owner || listing.owner.id !== user.id) {
          // The API returns 404 for other people's listings; match that so the
          // page does not confirm that someone else's listing exists.
          setLoadStatus("notfound");
          return;
        }

        setForm({
          title: listing.title || "",
          description: listing.description || "",
          price:
            typeof listing.price === "number" ? String(listing.price) : "",
          location: listing.location || "",
          country: listing.country || "",
          category: listing.category || LISTING_CATEGORIES[0],
        });
        setSavedImageUrl(listing.image_url || null);
        setLoadStatus("ready");
      })
      .catch((requestError) => {
        if (!active) return;
        if (requestError.status === 400 || requestError.status === 404) {
          setLoadStatus("notfound");
          return;
        }
        setLoadError(requestError.message);
        setLoadStatus("error");
      });

    return () => {
      active = false;
    };
  }, [editing, listingId, user, reloadKey]);

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

  if (editing && loadStatus === "loading") {
    return <FormSkeleton />;
  }

  if (editing && loadStatus === "notfound") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sand">
          Stay not found
        </p>
        <h1 className="mt-3 font-display text-3xl font-bold text-ink">
          We couldn't find a listing you can edit.
        </h1>
        <Link
          to="/my-listings"
          className="mt-6 inline-block rounded-full bg-earth px-6 py-3 text-sm font-semibold text-linen transition hover:bg-ink"
        >
          Back to my listings
        </Link>
      </div>
    );
  }

  if (editing && loadStatus === "error") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
        <h1 className="font-display text-3xl font-bold text-ink">
          We couldn't load this listing.
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-sand">
          {loadError || "The listings API is unavailable."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => setReloadKey((key) => key + 1)}
            className={buttonClass}
          >
            Try again
          </button>
          <Link to="/my-listings" className={secondaryButtonClass}>
            My listings
          </Link>
        </div>
      </div>
    );
  }

  const imageUrl = pendingImage?.url || savedImageUrl;

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    // A suggestion made from older field values should not linger.
    setAiSuggestion("");
  }

  async function handleGenerateDescription() {
    if (aiStatus === "loading") {
      return;
    }

    setAiError("");
    setAiSuggestion("");

    const title = form.title.trim();
    const location = form.location.trim();
    if (!title || !location) {
      setAiError(
        "Add a title and location first so the AI has something to work with."
      );
      return;
    }

    setAiStatus("loading");
    try {
      const result = await generateDescription({
        title,
        location,
        country: form.country.trim() || undefined,
        category: form.category,
        details: form.description.trim() || undefined,
      });
      setAiSuggestion(result.description);
    } catch (requestError) {
      setAiError(requestError.message);
    } finally {
      setAiStatus("idle");
    }
  }

  function applySuggestion() {
    setForm((current) => ({ ...current, description: aiSuggestion }));
    setAiSuggestion("");
    setAiError("");
  }

  function validate() {
    if (!form.title.trim()) {
      return "Please enter a title.";
    }
    if (!form.description.trim()) {
      return "Please enter a description.";
    }

    const price = Number(form.price);
    if (
      form.price === "" ||
      !Number.isFinite(price) ||
      !Number.isInteger(price) ||
      price < 0
    ) {
      return "Enter the nightly price as a whole number of rupees.";
    }

    if (!form.location.trim()) {
      return "Please enter a location.";
    }
    if (!form.country.trim()) {
      return "Please enter a country.";
    }
    if (!LISTING_CATEGORIES.includes(form.category)) {
      return "Please choose a category.";
    }
    if (!editing && !imageUrl) {
      return "Please add a photo for your listing.";
    }

    return "";
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    // Allow choosing the same file again after a failed upload.
    event.target.value = "";
    if (!file) {
      return;
    }

    setImageError("");

    if (file.type && !ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setImageError("Choose a PNG or JPEG image.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError("Images must be 5 MB or smaller.");
      return;
    }

    setUploading(true);
    try {
      const stored = await uploadImage(file);
      setPendingImage(stored);
    } catch (requestError) {
      setImageError(requestError.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleRemoveImage() {
    if (!imageUrl || removingImage) {
      return;
    }

    const message =
      pendingImage && savedImageUrl
        ? "Discard the new photo and keep the current one?"
        : "Remove this photo from the listing?";
    if (!window.confirm(message)) {
      return;
    }

    setImageError("");

    if (pendingImage) {
      // The new upload was never saved on the listing. Drop the reference;
      // the previous saved photo (if any) is still attached.
      setPendingImage(null);
      return;
    }

    setRemovingImage(true);
    try {
      await deleteListingImage(listingId);
      setSavedImageUrl(null);
    } catch (requestError) {
      setImageError(requestError.message);
    } finally {
      setRemovingImage(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting || uploading || removingImage) {
      return;
    }

    const problem = validate();
    if (problem) {
      setFormError(problem);
      return;
    }

    setFormError("");
    setSubmitting(true);

    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      price: Number(form.price),
      location: form.location.trim(),
      country: form.country.trim(),
      category: form.category,
    };
    if (pendingImage) {
      payload.image = pendingImage;
    }

    try {
      if (editing) {
        const updated = await updateListing(listingId, payload);
        navigate(`/listings/${updated.id}`, { replace: true });
      } else {
        const created = await createListing(payload);
        navigate(`/listings/${created.id}`, { replace: true });
      }
    } catch (requestError) {
      setFormError(requestError.message);
      setSubmitting(false);
    }
  }

  const busy = submitting || uploading || removingImage;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sand">
        {editing ? "Edit listing" : "New listing"}
      </p>
      <h1 className="mt-1 font-display text-3xl font-bold text-ink">
        {editing ? "Update your stay" : "Create a new listing"}
      </h1>
      <p className="mt-2 text-sm text-sand">
        {editing
          ? "Changes are visible to guests as soon as you save."
          : "Share your space with guests on EazyInvites."}
      </p>

      <form className="mt-8 space-y-5" onSubmit={handleSubmit} noValidate>
        {formError && (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {formError}
          </p>
        )}

        <div>
          <label className={labelClass} htmlFor="title">
            Title
          </label>
          <input
            id="title"
            name="title"
            type="text"
            required
            className={inputClass}
            placeholder="e.g. Cozy cabin in the woods"
            value={form.title}
            onChange={updateField}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="description">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            rows={4}
            required
            className={inputClass}
            placeholder="Describe the space, the views, and what makes it special."
            value={form.description}
            onChange={updateField}
          />

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleGenerateDescription}
              disabled={aiStatus === "loading" || busy}
              className="rounded-full border-clay px-5 text-earth hover:border-sand"
            >
              {aiStatus === "loading"
                ? "Generating…"
                : form.description.trim()
                  ? "Refine with AI"
                  : "Generate with AI"}
            </Button>
            <span className="text-xs text-sand">
              Uses the title, location, category, and any text you have written.
            </span>
          </div>

          {aiError && (
            <Alert variant="destructive" className="mt-3 border-red-200">
              <AlertTitle>Description not generated</AlertTitle>
              <AlertDescription>{aiError}</AlertDescription>
            </Alert>
          )}

          {aiSuggestion && (
            <Alert className="mt-3 border-clay bg-linen">
              <AlertTitle>Suggested description</AlertTitle>
              <AlertDescription>
                <p className="mt-1 whitespace-pre-line text-ink">
                  {aiSuggestion}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={applySuggestion}
                    className="rounded-full bg-earth px-4 text-linen hover:bg-ink"
                  >
                    Use this description
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setAiSuggestion("")}
                    className="rounded-full"
                  >
                    Discard
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="price">
              Price per night (₹)
            </label>
            <input
              id="price"
              name="price"
              type="number"
              min="0"
              step="1"
              required
              className={inputClass}
              placeholder="e.g. 2500"
              value={form.price}
              onChange={updateField}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="category">
              Category
            </label>
            <select
              id="category"
              name="category"
              required
              className={inputClass}
              value={form.category}
              onChange={updateField}
            >
              {LISTING_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="location">
              Location
            </label>
            <input
              id="location"
              name="location"
              type="text"
              required
              className={inputClass}
              placeholder="e.g. Manali"
              value={form.location}
              onChange={updateField}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="country">
              Country
            </label>
            <input
              id="country"
              name="country"
              type="text"
              required
              className={inputClass}
              placeholder="e.g. India"
              value={form.country}
              onChange={updateField}
            />
          </div>
        </div>

        <p className="text-xs text-sand">
          We look up the location with MapTiler to show it on the listing map.
        </p>

        <div>
          <span className={labelClass}>Photo</span>
          <div className="mt-2 overflow-hidden rounded-2xl border border-clay bg-clay/40">
            {imageUrl ? (
              <ListingImage
                src={imageUrl}
                alt="Listing photo preview"
                className="h-56 w-full object-cover"
              />
            ) : (
              <p className="px-4 py-12 text-center text-sm text-sand">
                No photo added yet.
              </p>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label
              className={`${secondaryButtonClass} cursor-pointer ${
                busy ? "cursor-not-allowed opacity-60" : ""
              }`}
            >
              {imageUrl ? "Replace photo" : "Upload photo"}
              <input
                type="file"
                accept="image/png,image/jpeg"
                className="sr-only"
                onChange={handleFileChange}
                disabled={busy}
              />
            </label>

            {imageUrl && (
              <button
                type="button"
                onClick={handleRemoveImage}
                disabled={busy}
                className="rounded-full border border-red-200 px-5 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {removingImage ? "Removing…" : "Remove photo"}
              </button>
            )}

            {uploading && <span className="text-xs text-sand">Uploading…</span>}
          </div>

          <p className="mt-2 text-xs text-sand">PNG or JPEG, up to 5 MB.</p>

          {imageError && (
            <p
              role="alert"
              className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {imageError}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button type="submit" disabled={busy} className={buttonClass}>
            {submitting
              ? editing
                ? "Saving…"
                : "Creating…"
              : editing
                ? "Save changes"
                : "Create listing"}
          </button>
          <Link
            to={editing ? `/listings/${listingId}` : "/my-listings"}
            className={secondaryButtonClass}
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
