/**
 * Phase 0 test environment.
 *
 * Creates a unique, disposable MongoDB database on a local server, installs
 * provider doubles before the Express app is loaded, and exports small helpers
 * for fixture setup and teardown.
 */

const assert = require("node:assert/strict");
const https = require("node:https");
const { URL } = require("node:url");
const mongoose = require("mongoose");

const { CATEGORIES } = require("../../schema");
const Listing = require("../../models/listing");
const Review = require("../../models/review");
const User = require("../../models/user");

function buildTestDatabaseUrl() {
  const base = process.env.TEST_MONGODB_URI || "mongodb://127.0.0.1:27017";
  const parsed = new URL(base);

  assert.equal(parsed.protocol, "mongodb:", "TEST_MONGODB_URI must use mongodb://");
  assert.ok(
    ["127.0.0.1", "localhost", "::1", "[::1]"].includes(parsed.hostname),
    "Phase 0 tests may only use a local MongoDB server",
  );
  assert.equal(parsed.username, "", "TEST_MONGODB_URI must not contain credentials");
  assert.equal(parsed.password, "", "TEST_MONGODB_URI must not contain credentials");
  assert.ok(
    parsed.pathname === "" || parsed.pathname === "/",
    "TEST_MONGODB_URI must not select a database; tests create their own",
  );
  assert.equal(parsed.search, "", "TEST_MONGODB_URI must not contain query options");

  const databaseName = `homestay_phase0_test_${process.pid}_${Date.now()}`;
  const port = parsed.port || "27017";
  // URL#hostname keeps the brackets for a bracketed IPv6 literal but returns
  // the bare address when the input is unbracketed. MongoDB URIs require the
  // bracketed form.
  const host = parsed.hostname === "::1" ? "[::1]" : parsed.hostname;
  return {
    databaseName,
    url: `mongodb://${host}:${port}/${databaseName}`,
  };
}

const testDatabase = buildTestDatabaseUrl();

process.env.NODE_ENV = "test";
process.env.ATLAS_DB_URL = testDatabase.url;
process.env.SECRET = "phase0-test-session-secret-not-for-production";
process.env.CLOUD_NAME = "phase0-test-cloud";
process.env.CLOUD_API_KEY = "phase0-test-key";
process.env.CLOUD_API_SECRET = "phase0-test-secret";
process.env.MAPTILER_API_KEY = "phase0-test-maptiler";
process.env.GEMINI_API_KEY = "phase0-test-gemini";
process.env.GOOGLE_GENERATIVE_AI_API_KEY = "phase0-test-google";

// Load the provider doubles only after the dummy credentials are in place.
// providers.js loads cloudConfig.js, which captures the Cloudinary settings at
// module-load time; loading it earlier could capture real shell credentials.
const providers = require("./providers");

// Fail loudly if a provider double is bypassed and code attempts an outbound
// call. MongoDB and local supertest traffic do not use these APIs.
globalThis.fetch = async () => {
  throw new Error("Phase 0 tests disable outbound fetch requests");
};
https.request = () => {
  throw new Error("Phase 0 tests disable outbound HTTPS requests");
};
https.get = () => {
  throw new Error("Phase 0 tests disable outbound HTTPS requests");
};

// Install doubles before controllers are loaded.
providers.install();

const { app, connectToDatabase, sessionStore } = require("../../app");

function assertTestDatabase() {
  assert.ok(
    mongoose.connection.name.startsWith("homestay_phase0_test_"),
    `Refusing to operate on non-test database: ${mongoose.connection.name}`,
  );
}

async function connectTestDatabase() {
  await connectToDatabase();
  assertTestDatabase();
  await mongoose.connection.dropDatabase();
  await Promise.all([User.createIndexes(), Listing.createIndexes(), Review.createIndexes()]);
}

async function resetTestDatabase() {
  assertTestDatabase();
  await Review.deleteMany({});
  await Listing.deleteMany({});
  await User.deleteMany({});
  await mongoose.connection.collection("sessions").deleteMany({});
}

async function closeTestDatabase() {
  if (mongoose.connection.readyState === 1) {
    assertTestDatabase();
    await mongoose.connection.dropDatabase();
  }
  await sessionStore.close();
  await mongoose.disconnect();
}

async function createUser(overrides = {}) {
  const username = overrides.username || `user_${Math.random().toString(36).slice(2, 10)}`;
  const password = overrides.password || "Password123!";
  const email = overrides.email || `${username}@example.test`;
  const user = await User.register(new User({ username, email }), password);
  return { user, password };
}

async function createListing(owner, overrides = {}) {
  const listing = new Listing({
    title: "Test Lakeside Cottage",
    description: "A synthetic listing used only by Phase 0 tests.",
    image: {
      url: "https://example.test/images/test-cottage.jpg",
      filename: "test-cottage",
    },
    price: 5500,
    location: "Pune",
    country: "India",
    geometry: { type: "Point", coordinates: [73.8567, 18.5204] },
    category: CATEGORIES[0],
    owner: owner._id,
    ...overrides,
  });
  await listing.save();
  return listing;
}

async function createReview(listing, author, overrides = {}) {
  const review = new Review({
    rating: 4,
    comment: "Synthetic review used only by Phase 0 tests.",
    author: author._id,
    ...overrides,
  });
  await review.save();
  listing.review.push(review._id);
  await listing.save();
  return review;
}

module.exports = {
  app,
  connectTestDatabase,
  resetTestDatabase,
  closeTestDatabase,
  createUser,
  createListing,
  createReview,
  providers,
  testDatabase,
  CATEGORIES,
  Listing,
  Review,
  User,
  mongoose,
};
