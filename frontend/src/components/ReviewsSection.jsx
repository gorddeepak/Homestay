import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Pencil, Star, Trash2 } from "lucide-react";

import {
  createReview,
  deleteReview,
  getReviews,
  updateReview,
} from "../api";
import { useAuth } from "../auth";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./ui/alert-dialog";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Label } from "./ui/label";
import { Separator } from "./ui/separator";
import { Skeleton } from "./ui/skeleton";
import { Textarea } from "./ui/textarea";

const alertClass =
  "rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700";

function ratingName(value) {
  return value === 1 ? "1 star" : `${value} stars`;
}

function formatReviewDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function Stars({ rating, label }) {
  return (
    <span
      role="img"
      aria-label={label || `${rating} out of 5 stars`}
      className="inline-flex items-center gap-0.5"
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          aria-hidden="true"
          className={`size-4 ${
            star <= rating ? "fill-earth text-earth" : "text-sand"
          }`}
        />
      ))}
    </span>
  );
}

function RatingInput({ value, onChange, disabled }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div role="group" aria-label="Rating" className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            disabled={disabled}
            aria-label={ratingName(star)}
            aria-pressed={value === star}
            onClick={() => onChange(star)}
            className={`rounded-full p-1 transition hover:bg-clay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sand focus-visible:ring-offset-2 focus-visible:ring-offset-linen disabled:cursor-not-allowed disabled:opacity-60 ${
              value === star ? "bg-clay" : ""
            }`}
          >
            <Star
              aria-hidden="true"
              className={`size-6 ${
                star <= value ? "fill-earth text-earth" : "text-sand"
              }`}
            />
          </button>
        ))}
      </div>
      <span className="text-xs font-semibold text-earth">
        {value ? `${value} of 5 selected` : "Select a rating"}
      </span>
    </div>
  );
}

function ReviewCard({
  review,
  isOwn,
  editing,
  busy,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
}) {
  const [editRating, setEditRating] = useState(review.rating || 0);
  const [editComment, setEditComment] = useState(review.comment || "");
  const [editError, setEditError] = useState("");

  useEffect(() => {
    if (editing) {
      setEditRating(review.rating || 0);
      setEditComment(review.comment || "");
      setEditError("");
    }
  }, [editing, review.rating, review.comment]);

  const username = review.author?.username;
  const date = formatReviewDate(review.created_at);

  async function handleEdit(event) {
    event.preventDefault();
    if (busy) return;

    const comment = editComment.trim();
    if (!editRating) {
      setEditError("Select a rating from 1 to 5.");
      return;
    }
    if (!comment) {
      setEditError("Write a comment before saving.");
      return;
    }

    setEditError("");
    const message = await onSaveEdit(review.id, {
      rating: editRating,
      comment,
    });
    if (message) {
      setEditError(message);
    }
  }

  return (
    <Card className="rounded-2xl bg-white/70">
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Avatar>
              <AvatarFallback className="bg-clay font-display font-bold text-earth">
                {username ? username.charAt(0).toUpperCase() : "?"}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-semibold text-earth">
                {username ? `@${username}` : "Former guest"}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {typeof review.rating === "number" ? (
                  <Stars rating={review.rating} />
                ) : (
                  <Badge variant="secondary">No rating</Badge>
                )}
                {date && <span className="text-xs text-sand">{date}</span>}
              </div>
            </div>
          </div>

          {isOwn && !editing && (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={onStartEdit}
                disabled={busy}
              >
                <Pencil />
                Edit
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    disabled={busy}
                  >
                    <Trash2 />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this review?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Your review will be removed from this listing. This
                      cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="rounded-full" disabled={busy}>
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      className="rounded-full"
                      disabled={busy}
                      onClick={() => onDelete(review.id)}
                    >
                      {busy ? "Deleting…" : "Delete review"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>

        {editing ? (
          <form className="space-y-3" onSubmit={handleEdit}>
            {editError && (
              <p role="alert" className={alertClass}>
                {editError}
              </p>
            )}
            <RatingInput
              value={editRating}
              onChange={setEditRating}
              disabled={busy}
            />
            <div>
              <Label htmlFor={`edit-comment-${review.id}`}>Comment</Label>
              <Textarea
                id={`edit-comment-${review.id}`}
                className="mt-1"
                rows={3}
                maxLength={2000}
                value={editComment}
                onChange={(event) => setEditComment(event.target.value)}
                disabled={busy}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                size="sm"
                className="rounded-full px-4"
                disabled={busy}
              >
                {busy ? "Saving…" : "Save changes"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="rounded-full"
                onClick={onCancelEdit}
                disabled={busy}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <p className="text-sm leading-6 text-earth/80">
            {review.comment || "No comment was stored for this review."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function ReviewsSection({ listingId }) {
  const { user } = useAuth();
  const [reviews, setReviews] = useState([]);
  const [status, setStatus] = useState("loading");
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editingBusy, setEditingBusy] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [actionError, setActionError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;
    setStatus("loading");
    setLoadError("");

    getReviews(listingId)
      .then((data) => {
        if (!active) return;
        setReviews(data);
        setStatus("ready");
      })
      .catch((requestError) => {
        if (!active) return;
        setLoadError(requestError.message);
        setStatus("error");
      });

    return () => {
      active = false;
    };
  }, [listingId, reloadKey]);

  const ratedReviews = reviews.filter(
    (review) => typeof review.rating === "number"
  );
  const average =
    ratedReviews.length > 0
      ? ratedReviews.reduce((sum, review) => sum + review.rating, 0) /
        ratedReviews.length
      : null;

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;

    const trimmed = comment.trim();
    if (!rating) {
      setFormError("Select a rating from 1 to 5.");
      return;
    }
    if (!trimmed) {
      setFormError("Write a comment before posting.");
      return;
    }

    setFormError("");
    setSuccess("");
    setSubmitting(true);
    try {
      const created = await createReview(listingId, {
        rating,
        comment: trimmed,
      });
      setReviews((current) => [...current, created]);
      setRating(0);
      setComment("");
      setSuccess("Your review was posted.");
    } catch (requestError) {
      setFormError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveEdit(reviewId, changes) {
    setEditingBusy(true);
    setActionError("");
    try {
      const updated = await updateReview(listingId, reviewId, changes);
      setReviews((current) =>
        current.map((review) => (review.id === updated.id ? updated : review))
      );
      setEditingId(null);
      setSuccess("Review updated.");
      return "";
    } catch (requestError) {
      return requestError.message;
    } finally {
      setEditingBusy(false);
    }
  }

  async function handleDelete(reviewId) {
    if (deletingId) return;

    setDeletingId(reviewId);
    setActionError("");
    setSuccess("");
    try {
      await deleteReview(listingId, reviewId);
      setReviews((current) =>
        current.filter((review) => review.id !== reviewId)
      );
      if (editingId === reviewId) {
        setEditingId(null);
      }
      setSuccess("Review deleted.");
    } catch (requestError) {
      setActionError(requestError.message);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="mt-12 border-t border-clay pt-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold text-ink">
            Guest reviews
          </h2>
          <p className="mt-1 text-sm text-sand">
            {status === "ready"
              ? `${reviews.length} review${reviews.length === 1 ? "" : "s"}`
              : "Loading reviews…"}
          </p>
        </div>

        {average !== null && (
          <div className="flex items-center gap-2 rounded-full bg-clay px-4 py-2">
            <Stars
              rating={Math.round(average)}
              label={`Average rating ${average.toFixed(1)} out of 5`}
            />
            <span className="font-display text-lg font-bold text-ink">
              {average.toFixed(1)}
            </span>
            <span className="text-xs text-earth">/ 5</span>
          </div>
        )}
      </div>

      {success && (
        <p
          role="status"
          className="mt-4 rounded-xl border border-earth/30 bg-clay px-4 py-3 text-sm text-earth"
        >
          {success}
        </p>
      )}

      {actionError && (
        <p role="alert" className={`mt-4 ${alertClass}`}>
          {actionError}
        </p>
      )}

      {status === "loading" && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      )}

      {status === "error" && (
        <div className={`mt-6 ${alertClass}`} role="alert">
          <p>{loadError || "Reviews could not be loaded."}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => setReloadKey((key) => key + 1)}
          >
            Try again
          </Button>
        </div>
      )}

      {status === "ready" && reviews.length === 0 && (
        <Card className="mt-6 rounded-2xl border border-dashed border-sand bg-clay/40 shadow-none ring-0">
          <CardContent>
            <p className="py-6 text-center text-sm text-earth">
              No reviews yet. Be the first to share your stay.
            </p>
          </CardContent>
        </Card>
      )}

      {status === "ready" && reviews.length > 0 && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {reviews.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              isOwn={Boolean(
                user && review.author && review.author.id === user.id
              )}
              editing={editingId === review.id}
              busy={editingBusy || deletingId === review.id}
              onStartEdit={() => {
                setEditingId(review.id);
                setActionError("");
                setSuccess("");
              }}
              onCancelEdit={() => setEditingId(null)}
              onSaveEdit={handleSaveEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <Separator className="my-8" />

      {user ? (
        <Card className="rounded-2xl bg-white/70">
          <CardHeader>
            <CardTitle>Leave a review</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              {formError && (
                <p role="alert" className={alertClass}>
                  {formError}
                </p>
              )}

              <div>
                <p className="text-sm font-medium text-ink">Rating</p>
                <div className="mt-2">
                  <RatingInput
                    value={rating}
                    onChange={setRating}
                    disabled={submitting}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="review-comment">Comment</Label>
                <Textarea
                  id="review-comment"
                  className="mt-1"
                  rows={4}
                  maxLength={2000}
                  required
                  placeholder="What stood out about your stay?"
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  disabled={submitting}
                />
                <p className="mt-1 text-right text-xs text-sand">
                  {comment.length}/2000
                </p>
              </div>

              <Button
                type="submit"
                className="h-10 rounded-full px-6"
                disabled={submitting}
              >
                {submitting ? "Posting…" : "Post review"}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-2xl bg-clay/60">
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-earth">
              Sign in to share your experience at this stay.
            </p>
            <Button asChild className="h-10 rounded-full px-6">
              <Link to={`/login?next=/listings/${listingId}`}>
                Log in to review
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
