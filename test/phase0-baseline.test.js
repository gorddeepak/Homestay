const { after, before, beforeEach, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const request = require("supertest");

const {
  app,
  CATEGORIES,
  Listing,
  Review,
  User,
  mongoose,
  connectTestDatabase,
  resetTestDatabase,
  closeTestDatabase,
  createUser,
  createListing,
  createReview,
  providers,
} = require("./helpers/environment");

let server;
let serverPort;

function listenForRawRequests() {
  return new Promise((resolve, reject) => {
    server = app.listen(0, "127.0.0.1", () => {
      serverPort = server.address().port;
      resolve();
    });
    server.on("error", reject);
  });
}

function closeRawServer() {
  return new Promise((resolve) => {
    if (!server) return resolve();
    server.close(() => resolve());
  });
}

function rawJsonRequest(path, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = http.request(
      {
        host: "127.0.0.1",
        port: serverPort,
        path,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
            chunkCount: chunks.length,
          });
        });
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}

async function agentFor(user, password) {
  const agent = request.agent(app);
  const response = await agent
    .post("/login")
    .type("form")
    .send({ username: user.username, password });
  assert.equal(response.status, 302);
  assert.equal(response.headers.location, "/listings");
  return agent;
}

function deleteViaPost(agent, path) {
  return agent.post(path).query({ _method: "DELETE" }).type("form").send({});
}

async function seedPublicListings(owner) {
  const first = await createListing(owner, {
    title: "Alpha Seaside Stay",
    location: "Goa",
    category: "Coastal Haven",
  });
  const second = await createListing(owner, {
    title: "Beta Mountain Stay",
    location: "Manali",
    category: "Mountain Escape",
  });
  return { first, second };
}

describe("Phase 0 baseline", () => {
  before(async () => {
    await connectTestDatabase();
    await listenForRawRequests();
  });

  after(async () => {
    await closeRawServer();
    await closeTestDatabase();
  });

  beforeEach(async () => {
    providers.reset();
    await resetTestDatabase();
  });

  describe("public pages and listing index", () => {
    it("renders the home page and /listings with the same listing cards", async () => {
      const { user } = await createUser();
      await seedPublicListings(user);

      const home = await request(app).get("/");
      assert.equal(home.status, 200);
      assert.match(home.headers["content-type"], /text\/html/);
      assert.match(home.text, /Alpha Seaside Stay/);
      assert.match(home.text, /Beta Mountain Stay/);

      const index = await request(app).get("/listings");
      assert.equal(index.status, 200);
      assert.match(index.headers["content-type"], /text\/html/);
      assert.match(index.text, /Alpha Seaside Stay/);
      assert.match(index.text, /Beta Mountain Stay/);
    });

    it("renders listing detail with its owner and reviews", async () => {
      const { user: owner } = await createUser({ username: "detail_owner" });
      const { user: reviewer } = await createUser({ username: "detail_reviewer" });
      const listing = await createListing(owner, { title: "Detail Contract Stay" });
      await createReview(listing, reviewer, {
        rating: 5,
        comment: "The synthetic review appears on the detail page.",
      });

      const response = await request(app).get(`/listings/${listing._id}`);
      assert.equal(response.status, 200);
      assert.match(response.headers["content-type"], /text\/html/);
      assert.match(response.text, /Detail Contract Stay/);
      assert.match(response.text, /detail_owner/);
      assert.match(response.text, /The synthetic review appears on the detail page\./);
    });

    it("redirects to the index for a missing listing", async () => {
      const response = await request(app).get("/listings/507f1f77bcf86cd799439011");
      assert.equal(response.status, 302);
      assert.equal(response.headers.location, "/listings");
    });

    it("returns the HTML error page for an unknown route", async () => {
      const response = await request(app).get("/definitely-not-a-route");
      assert.equal(response.status, 404);
      assert.match(response.headers["content-type"], /text\/html/);
      assert.match(response.text, /Page Not Found!/);
    });
  });

  describe("authentication", () => {
    it("renders the signup and login forms", async () => {
      const signup = await request(app).get("/signup");
      assert.equal(signup.status, 200);
      assert.match(signup.headers["content-type"], /text\/html/);
      assert.match(signup.text, /action="\/signup"/);
      assert.match(signup.text, /name="username"/);
      assert.match(signup.text, /name="email"/);
      assert.match(signup.text, /name="password"/);

      const login = await request(app).get("/login");
      assert.equal(login.status, 200);
      assert.match(login.headers["content-type"], /text\/html/);
      assert.match(login.text, /action="\/login"/);
      assert.match(login.text, /name="username"/);
      assert.match(login.text, /name="password"/);
    });

    it("signs up a user, auto-logs in, and creates a session", async () => {
      const agent = request.agent(app);
      const response = await agent
        .post("/signup")
        .type("form")
        .send({
          username: "signup_contract_user",
          email: "signup_contract@example.test",
          password: "Password123!",
        });

      assert.equal(response.status, 302);
      assert.equal(response.headers.location, "/listings");

      const user = await User.findOne({ username: "signup_contract_user" });
      assert.ok(user);
      assert.equal(user.email, "signup_contract@example.test");

      const protectedPage = await agent.get("/listings/new");
      assert.equal(protectedPage.status, 200);
    });

    it("logs in a valid user and redirects to /listings", async () => {
      const { user, password } = await createUser({ username: "valid_login_user" });
      const agent = await agentFor(user, password);

      const protectedPage = await agent.get("/listings/new");
      assert.equal(protectedPage.status, 200);
    });

    it("rejects an invalid password and leaves the user unauthenticated", async () => {
      const { user } = await createUser({ username: "invalid_login_user" });
      const agent = request.agent(app);

      const response = await agent
        .post("/login")
        .type("form")
        .send({ username: user.username, password: "not-the-password" });

      assert.equal(response.status, 302);
      assert.equal(response.headers.location, "/login");

      const protectedPage = await agent.get("/listings/new");
      assert.equal(protectedPage.status, 302);
      assert.equal(protectedPage.headers.location, "/login");
    });

    it("logs out an authenticated user via the current GET contract", async () => {
      const { user, password } = await createUser({ username: "logout_contract_user" });
      const agent = await agentFor(user, password);

      const logout = await agent.get("/logout");
      assert.equal(logout.status, 302);
      assert.equal(logout.headers.location, "/listings");

      const protectedPage = await agent.get("/listings/new");
      assert.equal(protectedPage.status, 302);
      assert.equal(protectedPage.headers.location, "/login");
    });

    it("redirects unauthenticated users away from protected pages", async () => {
      const response = await request(app).get("/listings/new");
      assert.equal(response.status, 302);
      assert.equal(response.headers.location, "/login");
    });
  });

  describe("listing ownership", () => {
    it("creates a listing through mocked Cloudinary upload and mocked geocoding", async () => {
      const { user: owner, password } = await createUser({ username: "create_owner" });
      const agent = await agentFor(owner, password);

      const response = await agent
        .post("/listings")
        .field("listing[title]", "Created Through Contract")
        .field("listing[description]", "Created with a test-only upload double.")
        .field("listing[price]", "7200")
        .field("listing[location]", "Jaipur")
        .field("listing[country]", "India")
        .field("listing[category]", "Heritage Homestay")
        .attach("listing[image]", Buffer.from("phase-0-fake-image"), {
          filename: "phase0.png",
          contentType: "image/png",
        });

      assert.equal(response.status, 302);
      assert.equal(response.headers.location, "/listings");
      assert.equal(providers.state.upload.calls.length, 1);
      assert.equal(providers.state.upload.calls[0].originalname, "phase0.png");
      assert.deepEqual(providers.state.geocode.calls, ["Jaipur"]);

      const listing = await Listing.findOne({ title: "Created Through Contract" });
      assert.ok(listing);
      assert.ok(listing.owner.equals(owner._id));
      assert.equal(listing.image.url, providers.state.upload.path);
      assert.deepEqual(listing.geometry.coordinates, [72.8777, 19.076]);
    });

    it("lets the owner edit their listing without calling MapTiler when the location is unchanged", async () => {
      const { user: owner, password } = await createUser({ username: "edit_owner" });
      const listing = await createListing(owner, { title: "Before Edit" });
      const agent = await agentFor(owner, password);

      const editPage = await agent.get(`/listings/${listing._id}/edit`);
      assert.equal(editPage.status, 200);
      assert.match(editPage.text, /Before Edit/);

      const response = await agent
        .put(`/listings/${listing._id}`)
        .type("form")
        .send({
          listing: {
            title: "After Edit",
            description: "Updated by the owner in a Phase 0 test.",
            price: 6100,
            location: listing.location,
            country: listing.country,
            category: listing.category,
          },
        });

      assert.equal(response.status, 302);
      assert.equal(response.headers.location, `/listings/${listing._id}`);

      const updated = await Listing.findById(listing._id);
      assert.equal(updated.title, "After Edit");
      assert.equal(updated.price, 6100);
      assert.equal(providers.state.geocode.calls.length, 0);
    });

    it("re-geocodes with the mocked MapTiler client when the location changes", async () => {
      const { user: owner, password } = await createUser({ username: "geocode_owner" });
      const listing = await createListing(owner, { location: "Pune" });
      const agent = await agentFor(owner, password);

      providers.state.geocode.result = {
        features: [{ geometry: { type: "Point", coordinates: [77.209, 28.6139] } }],
      };

      const response = await agent
        .put(`/listings/${listing._id}`)
        .type("form")
        .send({
          listing: {
            title: listing.title,
            description: listing.description,
            price: listing.price,
            location: "New Delhi",
            country: listing.country,
            category: listing.category,
          },
        });

      assert.equal(response.status, 302);
      assert.deepEqual(providers.state.geocode.calls, ["New Delhi"]);

      const updated = await Listing.findById(listing._id);
      assert.equal(updated.location, "New Delhi");
      assert.deepEqual(updated.geometry.coordinates, [77.209, 28.6139]);
    });

    it("prevents a non-owner from editing or deleting another user's listing", async () => {
      const { user: owner } = await createUser({ username: "locked_owner" });
      const { user: other, password: otherPassword } = await createUser({
        username: "non_owner",
      });
      const listing = await createListing(owner, { title: "Owner Only Stay" });
      const agent = await agentFor(other, otherPassword);

      const editPage = await agent.get(`/listings/${listing._id}/edit`);
      assert.equal(editPage.status, 302);
      assert.equal(editPage.headers.location, "/listings");

      const update = await agent
        .put(`/listings/${listing._id}`)
        .type("form")
        .send({
          listing: {
            title: "Hijacked",
            description: "Should not be saved.",
            price: 1,
            location: listing.location,
            country: listing.country,
            category: listing.category,
          },
        });
      assert.equal(update.status, 302);
      assert.equal(update.headers.location, "/listings");

      const deletion = await deleteViaPost(agent, `/listings/${listing._id}`);
      assert.equal(deletion.status, 302);
      assert.equal(deletion.headers.location, "/listings");

      const unchanged = await Listing.findById(listing._id);
      assert.ok(unchanged);
      assert.equal(unchanged.title, "Owner Only Stay");
    });

    it("lets the owner delete their listing and cascades its reviews", async () => {
      const { user: owner, password } = await createUser({ username: "delete_owner" });
      const { user: reviewer } = await createUser({ username: "delete_reviewer" });
      const listing = await createListing(owner, { title: "Cascade Stay" });
      const review = await createReview(listing, reviewer);
      const agent = await agentFor(owner, password);

      const response = await deleteViaPost(agent, `/listings/${listing._id}`);
      assert.equal(response.status, 302);
      assert.equal(response.headers.location, "/listings");

      assert.equal(await Listing.findById(listing._id), null);
      assert.equal(await Review.findById(review._id), null);
    });
  });

  describe("review contracts", () => {
    it("lets an authenticated user create a review", async () => {
      const { user: owner } = await createUser({ username: "review_host" });
      const { user: reviewer, password } = await createUser({ username: "review_guest" });
      const listing = await createListing(owner);
      const agent = await agentFor(reviewer, password);

      const response = await agent
        .post(`/listings/${listing._id}/review`)
        .type("form")
        .send({
          review: { rating: 5, comment: "A real review created by a test." },
        });

      assert.equal(response.status, 302);
      assert.equal(response.headers.location, `/listings/${listing._id}`);

      const review = await Review.findOne({ comment: "A real review created by a test." });
      assert.ok(review);
      assert.equal(review.rating, 5);
      assert.ok(review.author.equals(reviewer._id));

      const updatedListing = await Listing.findById(listing._id);
      assert.ok(updatedListing.review.some((id) => id.equals(review._id)));
    });

    it("requires authentication before a valid review is accepted", async () => {
      const { user: owner } = await createUser({ username: "anonymous_review_host" });
      const listing = await createListing(owner);

      const response = await request(app)
        .post(`/listings/${listing._id}/review`)
        .type("form")
        .send({
          review: { rating: 4, comment: "Anonymous review attempt." },
        });

      assert.equal(response.status, 302);
      assert.equal(response.headers.location, "/login");
      assert.equal(await Review.countDocuments({}), 0);
    });

    it("lets only the author delete a review", async () => {
      const { user: owner } = await createUser({ username: "review_delete_host" });
      const { user: author, password: authorPassword } = await createUser({
        username: "review_author",
      });
      const { user: other, password: otherPassword } = await createUser({
        username: "review_other",
      });
      const listing = await createListing(owner);
      const review = await createReview(listing, author);

      const otherAgent = await agentFor(other, otherPassword);
      const blocked = await deleteViaPost(
        otherAgent,
        `/listings/${listing._id}/review/${review._id}`,
      );
      assert.equal(blocked.status, 302);
      assert.equal(blocked.headers.location, `/listings/${listing._id}`);
      assert.ok(await Review.findById(review._id));

      const authorAgent = await agentFor(author, authorPassword);
      const deleted = await deleteViaPost(
        authorAgent,
        `/listings/${listing._id}/review/${review._id}`,
      );
      assert.equal(deleted.status, 302);
      assert.equal(deleted.headers.location, `/listings/${listing._id}`);
      assert.equal(await Review.findById(review._id), null);

      const updatedListing = await Listing.findById(listing._id);
      assert.equal(updatedListing.review.some((id) => id.equals(review._id)), false);
    });

    it("[characterization] deletes an authored review through a mismatched listing ID", async () => {
      const { user: owner } = await createUser({ username: "mismatch_host" });
      const { user: author, password } = await createUser({ username: "mismatch_author" });
      const first = await createListing(owner, { title: "First Mismatch Stay" });
      const second = await createListing(owner, { title: "Second Mismatch Stay" });
      const review = await createReview(first, author);
      const agent = await agentFor(author, password);

      const response = await deleteViaPost(
        agent,
        `/listings/${second._id}/review/${review._id}`,
      );
      assert.equal(response.status, 302);
      assert.equal(response.headers.location, `/listings/${second._id}`);

      // Current defect: the review is deleted, but the first listing still
      // contains a dangling reference and the second listing was unaffected.
      assert.equal(await Review.findById(review._id), null);
      const firstAfter = await Listing.findById(first._id);
      assert.ok(firstAfter.review.some((id) => id.equals(review._id)));
      const secondAfter = await Listing.findById(second._id);
      assert.equal(secondAfter.review.length, 0);
    });

    it("[characterization] rejects a review with no rating field", async () => {
      const { user: owner } = await createUser({ username: "no_rating_host" });
      const { user: reviewer, password } = await createUser({ username: "no_rating_guest" });
      const listing = await createListing(owner);
      const agent = await agentFor(reviewer, password);

      const response = await agent
        .post(`/listings/${listing._id}/review`)
        .type("form")
        .send({ review: { comment: "No rating was submitted." } });

      assert.equal(response.status, 400);
      assert.equal(await Review.countDocuments({}), 0);
    });

    it("[characterization] stores 1 star when the form's checked no-rating value is submitted", async () => {
      const { user: owner } = await createUser({ username: "default_rating_host" });
      const { user: reviewer, password } = await createUser({
        username: "default_rating_guest",
      });
      const listing = await createListing(owner);
      const agent = await agentFor(reviewer, password);

      // This mirrors the browser form: the hidden "no rating" radio is checked
      // and its value is 1, so no explicit star selection still sends rating=1.
      const response = await agent
        .post(`/listings/${listing._id}/review`)
        .type("form")
        .send({
          review: { rating: 1, comment: "Submitted without choosing a star." },
        });

      assert.equal(response.status, 302);
      const review = await Review.findOne({ comment: "Submitted without choosing a star." });
      assert.ok(review);
      assert.equal(review.rating, 1);
    });

    it("[characterization] validates a review body before checking authentication", async () => {
      const { user: owner } = await createUser({ username: "validation_order_host" });
      const listing = await createListing(owner);

      const response = await request(app)
        .post(`/listings/${listing._id}/review`)
        .type("form")
        .send({ review: { comment: "Missing rating." } });

      assert.equal(response.status, 400);
      assert.equal(await Review.countDocuments({}), 0);
    });
  });

  describe("AI description contract", () => {
    it("returns the expected JSON shape and sends the prompt to the mocked Gemini client", async () => {
      providers.state.description.text = "A clear, deterministic description.";

      const response = await request(app)
        .post("/listings/ai/generate_description")
        .send({ title: "Test House", location: "Pune", category: "Urban Oasis" });

      assert.equal(response.status, 200);
      assert.match(response.headers["content-type"], /application\/json/);
      assert.deepEqual(response.body, { description: "A clear, deterministic description." });
      assert.equal(providers.state.description.calls.length, 1);
      assert.match(
        providers.state.description.calls[0].input,
        /Title: Test House[\s\S]*Location: Pune[\s\S]*Category: Urban Oasis/,
      );
    });

    it("[characterization] accepts an empty description request body", async () => {
      const response = await request(app)
        .post("/listings/ai/generate_description")
        .send({});

      assert.equal(response.status, 200);
      assert.equal(providers.state.description.calls.length, 1);
      assert.match(providers.state.description.calls[0].input, /Title: undefined/);
    });

    it("returns a JSON 400 for malformed JSON", async () => {
      const response = await request(app)
        .post("/listings/ai/generate_description")
        .set("Content-Type", "application/json")
        .send('{"title":');

      assert.equal(response.status, 400);
      assert.match(response.headers["content-type"], /application\/json/);
      assert.ok(response.body.error);
      assert.equal(providers.state.description.calls.length, 0);
    });

    it("[characterization] exposes the raw provider error through the shared error handler", async () => {
      providers.state.description.error = new Error("synthetic provider failure");

      const response = await request(app)
        .post("/listings/ai/generate_description")
        .send({ title: "Failure House", location: "Pune", category: "Rural Charm" });

      assert.equal(response.status, 500);
      assert.match(response.headers["content-type"], /application\/json/);
      assert.deepEqual(response.body, { error: "synthetic provider failure" });
    });
  });

  describe("AI chat contract", () => {
    it("returns an incremental plain-text stream and passes the messages to the mocked SDK", async () => {
      providers.state.chat.chunks = ["Hello ", "from ", "the stream."];

      const response = await request(app)
        .post("/listings/ai/chat")
        .send({
          messages: [{ role: "user", content: "Find a quiet stay" }],
        });

      assert.equal(response.status, 200);
      assert.match(response.headers["content-type"], /text\/plain/);
      assert.equal(response.text, "Hello from the stream.");
      assert.equal(providers.state.chat.writes, 3);
      assert.equal(providers.state.chat.calls.length, 1);
      assert.deepEqual(providers.state.chat.calls[0].messages, [
        { role: "user", content: "Find a quiet stay" },
      ]);
    });

    it("streams over raw HTTP without SSE framing", async () => {
      providers.state.chat.chunks = ["one", "two", "three"];

      const response = await rawJsonRequest("/listings/ai/chat", {
        messages: [{ role: "user", content: "Stream this" }],
      });

      assert.equal(response.status, 200);
      assert.match(response.headers["content-type"], /text\/plain/);
      assert.equal(response.body, "onetwothree");
      assert.equal(response.chunkCount >= 1, true);
      assert.doesNotMatch(response.body, /^data:/);
      assert.equal(providers.state.chat.writes, 3);
    });

    it("returns a JSON 400 when messages is missing or not an array", async () => {
      const missing = await request(app).post("/listings/ai/chat").send({});
      assert.equal(missing.status, 400);
      assert.match(missing.headers["content-type"], /application\/json/);
      assert.ok(missing.body.error);

      const wrongType = await request(app)
        .post("/listings/ai/chat")
        .send({ messages: "not-an-array" });
      assert.equal(wrongType.status, 400);
      assert.ok(wrongType.body.error);
    });

    it("[characterization] turns an empty messages array into a generic 500", async () => {
      const response = await request(app)
        .post("/listings/ai/chat")
        .send({ messages: [] });

      assert.equal(response.status, 500);
      assert.match(response.headers["content-type"], /application\/json/);
      assert.deepEqual(response.body, { error: "Chat failed, please try again." });
      assert.equal(providers.state.chat.calls.length, 1);
    });

    it("returns a JSON 400 for malformed JSON", async () => {
      const response = await request(app)
        .post("/listings/ai/chat")
        .set("Content-Type", "application/json")
        .send('{"messages": [}');

      assert.equal(response.status, 400);
      assert.match(response.headers["content-type"], /application\/json/);
      assert.ok(response.body.error);
      assert.equal(providers.state.chat.calls.length, 0);
    });

    it("returns a safe JSON 500 when the mocked stream setup fails", async () => {
      providers.state.chat.error = new Error("synthetic chat failure");

      const response = await request(app)
        .post("/listings/ai/chat")
        .send({ messages: [{ role: "user", content: "Fail" }] });

      assert.equal(response.status, 500);
      assert.match(response.headers["content-type"], /application\/json/);
      assert.deepEqual(response.body, { error: "Chat failed, please try again." });
    });
  });

  describe("AI natural-language search contract", () => {
    it("returns the current EJS listing fragment as HTML", async () => {
      const { user } = await createUser();
      await seedPublicListings(user);
      providers.state.search.filters = { location: "Goa" };

      const response = await request(app)
        .post("/listings/ai/search")
        .send({ query: "show me stays in Goa" });

      assert.equal(response.status, 200);
      assert.match(response.headers["content-type"], /text\/html/);
      assert.match(response.text, /Alpha Seaside Stay/);
      assert.doesNotMatch(response.text, /Beta Mountain Stay/);
      assert.match(response.text, /listing-col/);
      assert.doesNotMatch(response.text, /<!DOCTYPE/i);
      assert.equal(providers.state.search.calls.length, 1);
    });

    it("[characterization] passes a regex metacharacter through to MongoDB", async () => {
      const { user } = await createUser();
      await seedPublicListings(user);
      providers.state.search.filters = { location: ".*" };

      const response = await request(app)
        .post("/listings/ai/search")
        .send({ query: "match everything" });

      assert.equal(response.status, 200);
      assert.match(response.text, /Alpha Seaside Stay/);
      assert.match(response.text, /Beta Mountain Stay/);
    });

    it("returns a JSON 400 when query is missing or malformed", async () => {
      const missing = await request(app).post("/listings/ai/search").send({});
      assert.equal(missing.status, 400);
      assert.match(missing.headers["content-type"], /application\/json/);
      assert.ok(missing.body.error);

      const malformed = await request(app)
        .post("/listings/ai/search")
        .set("Content-Type", "application/json")
        .send('{"query":');
      assert.equal(malformed.status, 400);
      assert.match(malformed.headers["content-type"], /application\/json/);
      assert.ok(malformed.body.error);
      assert.equal(providers.state.search.calls.length, 0);
    });

    it("returns a safe JSON 500 when the mocked extraction fails", async () => {
      providers.state.search.error = new Error("synthetic extraction failure");

      const response = await request(app)
        .post("/listings/ai/search")
        .send({ query: "anything" });

      assert.equal(response.status, 500);
      assert.match(response.headers["content-type"], /application\/json/);
      assert.deepEqual(response.body, { error: "Search failed" });
    });

    it("exposes the current tool query semantics", async () => {
      const { user: owner } = await createUser({ username: "tool_owner" });
      const { user: reviewer } = await createUser({ username: "tool_reviewer" });
      const listing = await createListing(owner, {
        title: "Tool Review Stay",
        location: "Goa",
      });
      await createReview(listing, reviewer, { comment: "A tool-visible review." });
      for (let index = 0; index < 6; index += 1) {
        await createListing(owner, { title: `Extra Tool Stay ${index}`, location: "Goa" });
      }

      await request(app)
        .post("/listings/ai/chat")
        .send({ messages: [{ role: "user", content: "Find stays" }] });

      const tools = providers.state.chat.calls[0].tools;
      const searchResults = await tools.searchListings.execute({ location: ".*" });
      assert.equal(searchResults.length, 5);

      const reviewResult = await tools.getListingReviews.execute({
        listingTitle: "Tool Review Stay",
      });
      assert.equal(reviewResult.title, "Tool Review Stay");
      assert.deepEqual(reviewResult.reviews, [
        { rating: 4, comment: "A tool-visible review." },
      ]);

      const missing = await tools.getListingReviews.execute({
        listingTitle: "Does Not Exist",
      });
      assert.deepEqual(missing, { error: "Listing not found" });
    });
  });

  describe("missing and malformed data", () => {
    async function insertRawListing(overrides) {
      const { user: owner } = await createUser();
      const document = {
        title: "Raw Fixture Stay",
        description: "Inserted directly to bypass Mongoose validation.",
        image: { url: "https://example.test/raw.jpg", filename: "raw" },
        price: 4500,
        location: "Pune",
        country: "India",
        geometry: { type: "Point", coordinates: [73.8567, 18.5204] },
        category: "Rural Charm",
        review: [],
        owner: owner._id,
        ...overrides,
      };
      const result = await Listing.collection.insertOne(document);
      return result.insertedId;
    }

    it("[characterization] renders an empty image source when a listing has no image", async () => {
      const id = await insertRawListing({ image: undefined });
      const response = await request(app).get(`/listings/${id}`);
      assert.equal(response.status, 200);
      assert.match(response.headers["content-type"], /text\/html/);
      assert.match(response.text, /<img src=""[^>]*class="w-100 rounded-4 show-hero-img">/);
    });

    it("[characterization] returns 500 when a listing has no price", async () => {
      const id = await insertRawListing({ price: undefined });
      const response = await request(app).get(`/listings/${id}`);
      assert.equal(response.status, 500);
      assert.match(response.headers["content-type"], /text\/html/);
    });

    it("[characterization] returns 500 when a listing has no owner", async () => {
      const id = await insertRawListing({ owner: undefined });
      const response = await request(app).get(`/listings/${id}`);
      assert.equal(response.status, 500);
      assert.match(response.headers["content-type"], /text\/html/);
    });

    it("[characterization] falls back to default map coordinates when geometry is missing", async () => {
      const id = await insertRawListing({ geometry: undefined });
      const response = await request(app).get(`/listings/${id}`);
      assert.equal(response.status, 200);
      assert.match(response.text, /77\.209/);
      assert.match(response.text, /28\.6139/);
    });
  });

  describe("category and review edge cases", () => {
    it("accepts all 11 categories in the Mongoose model", async () => {
      const { user: owner } = await createUser({ username: "category_owner" });
      assert.equal(CATEGORIES.length, 11);

      for (const category of CATEGORIES) {
        const listing = new Listing({
          title: `Category ${category}`,
          description: "Synthetic category validation fixture.",
          image: { url: "https://example.test/category.jpg", filename: "category" },
          price: 5000,
          location: "Pune",
          country: "India",
          geometry: { type: "Point", coordinates: [73.8567, 18.5204] },
          category,
          owner: owner._id,
        });
        assert.equal(listing.validateSync(), undefined, category);
      }
    });

    it("[characterization] exposes only 8 of 11 categories in the create form", async () => {
      const { user, password } = await createUser({ username: "category_form_user" });
      const agent = await agentFor(user, password);
      const response = await agent.get("/listings/new");
      assert.equal(response.status, 200);

      for (const category of CATEGORIES.slice(0, 8)) {
        assert.match(response.text, new RegExp(`value="${category}"`), category);
      }
      for (const category of CATEGORIES.slice(8)) {
        assert.doesNotMatch(response.text, new RegExp(`value="${category}"`), category);
      }
    });
  });

  describe("health and readiness", () => {
    it("returns liveness JSON and has no readiness endpoint", async () => {
      const health = await request(app).get("/health");
      assert.equal(health.status, 200);
      assert.match(health.headers["content-type"], /application\/json/);
      assert.deepEqual(health.body, { ok: true });

      const readiness = await request(app).get("/ready");
      assert.equal(readiness.status, 404);
      assert.match(readiness.headers["content-type"], /text\/html/);
    });

    it("[characterization] reports healthy after MongoDB disconnects", async () => {
      await mongoose.disconnect();
      try {
        const health = await request(app).get("/health");
        assert.equal(health.status, 200);
        assert.deepEqual(health.body, { ok: true });
      } finally {
        await connectTestDatabase();
      }
    });
  });

  describe("deferred secure contracts", () => {
    it.todo("SECURITY: logout must be POST-only and CSRF-protected");
    it.todo("SECURITY: every cookie-authenticated mutation must require a CSRF token");
    it.todo("SECURITY: review deletion must reject a review that belongs to another listing");
    it.todo("SECURITY: AI endpoints must enforce authentication or quotas and rate limits");
    it.todo("SECURITY: regex inputs must be escaped before reaching MongoDB");
    it.todo("FUTURE: review submission must not silently become a 1-star review");
    it.todo("FUTURE: listing forms must expose all 11 categories");
    it.todo("FUTURE: missing image, price, or owner must return a controlled error, not a 500");
    it.todo("FUTURE: a /ready endpoint must report MongoDB readiness separately from /health");
    it.todo("FUTURE: AI chat must emit a versioned UI message stream for AI Elements");
  });
});
