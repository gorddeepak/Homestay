function fieldLabel(location) {
  if (!Array.isArray(location)) {
    return "This field";
  }

  const field = [...location]
    .reverse()
    .find((part) => typeof part === "string" && part !== "body");

  return field ? field.replace(/_/g, " ") : "This field";
}

function errorMessage(body, status) {
  if (body && typeof body.detail === "string") {
    return body.detail;
  }

  // FastAPI validation errors arrive as a list of {loc, msg, type}.
  if (body && Array.isArray(body.detail)) {
    const messages = body.detail
      .filter((item) => item && typeof item.msg === "string")
      .map((item) => `${fieldLabel(item.loc)}: ${item.msg}`);

    if (messages.length > 0) {
      return messages.join(" ");
    }
  }

  if (status === 401) {
    return "Please sign in to continue.";
  }
  if (status === 403) {
    return "This request was blocked. Please refresh the page and try again.";
  }
  if (status === 404) {
    return "That listing could not be found.";
  }
  if (status === 413) {
    return "That file is too large.";
  }
  if (status === 422) {
    return "Please check the form and try again.";
  }
  return "Something went wrong. Please try again.";
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      credentials: "same-origin",
      ...options,
    });
  } catch {
    throw new Error("The API is unavailable. Is FastAPI running?");
  }

  if (!response.ok) {
    let body = null;
    try {
      body = await response.json();
    } catch {
      // Keep the status-based message when the response is not JSON.
    }

    const error = new Error(errorMessage(body, response.status));
    error.status = response.status;
    throw error;
  }

  return response.json();
}

function send(path, method, body) {
  return request(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function post(path, body) {
  return send(path, "POST", body);
}

export function getListings() {
  return request("/listings");
}

export function getListing(listingId) {
  return request(`/listings/${encodeURIComponent(listingId)}`);
}

export function getMyListings() {
  return request("/listings/mine");
}

export function createListing(listing) {
  return post("/listings", listing);
}

export function updateListing(listingId, changes) {
  return send(`/listings/${encodeURIComponent(listingId)}`, "PATCH", changes);
}

export function deleteListing(listingId) {
  return request(`/listings/${encodeURIComponent(listingId)}`, {
    method: "DELETE",
  });
}

export function deleteListingImage(listingId) {
  return request(`/listings/${encodeURIComponent(listingId)}/image`, {
    method: "DELETE",
  });
}

export function getReviews(listingId) {
  return request(`/listings/${encodeURIComponent(listingId)}/reviews`);
}

export function createReview(listingId, review) {
  return post(`/listings/${encodeURIComponent(listingId)}/reviews`, review);
}

export function updateReview(listingId, reviewId, changes) {
  return send(
    `/listings/${encodeURIComponent(listingId)}/reviews/${encodeURIComponent(reviewId)}`,
    "PATCH",
    changes
  );
}

export function deleteReview(listingId, reviewId) {
  return request(
    `/listings/${encodeURIComponent(listingId)}/reviews/${encodeURIComponent(reviewId)}`,
    { method: "DELETE" }
  );
}

export function uploadImage(file) {
  const body = new FormData();
  body.append("file", file);

  // Do not set Content-Type: the browser adds the multipart boundary.
  return request("/uploads", { method: "POST", body });
}

export function getConfig() {
  return request("/config");
}

export function generateDescription(details) {
  return post("/ai/generate-description", details);
}

export function aiSearch(query) {
  return post("/listings/ai-search", { query });
}

export function getMe() {
  return request("/auth/me");
}

export function login(credentials) {
  return post("/auth/login", credentials);
}

export function signup(details) {
  return post("/auth/signup", details);
}

export function logout() {
  return post("/auth/logout", {});
}
