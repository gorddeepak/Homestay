/**
 * init.js  —  Database seeder
 *
 * Run with:  node init/index.js
 *
 * What it does:
 *   1. Drops Reviews → Listings → Users (safe deletion order)
 *   2. Creates 3 sample users
 *   3. Inserts all listings, owned round-robin across sample users
 *   4. Creates 2-3 reviews per listing from the reviewPool,
 *      authored round-robin across sample users
 *   5. Attaches review _ids to each listing
 *   6. Closes the connection cleanly
 */

const mongoose = require("mongoose");
const Listing  = require("../models/listing.js");
const Review   = require("../models/review.js");
const User     = require("../models/user.js");
const { data: sampleListings, reviewPool } = require("./data.js");

const MONGO_URL = "mongodb://127.0.0.1:27017/homestay";

// ─── Sample users ─────────────────────────────────────────────────────────────
// ─── Sample users ─────────────────────────────────────────────────────────────
const sampleUsers = [
  { username: "alice_travels",   email: "alice@example.com",   password: "Password123" },
  { username: "bob_explorer",    email: "bob@example.com",     password: "Password123" },
  { username: "cara_wanders",    email: "cara@example.com",    password: "Password123" },
  { username: "danny_nomad",     email: "danny@example.com",   password: "Password123" },
  { username: "elena_roams",     email: "elena@example.com",   password: "Password123" },
  { username: "farid_journeys",  email: "farid@example.com",   password: "Password123" },
  { username: "grace_wayfarer",  email: "grace@example.com",   password: "Password123" },
  { username: "hiro_treks",      email: "hiro@example.com",    password: "Password123" },
  { username: "isla_voyages",    email: "isla@example.com",    password: "Password123" },
  { username: "jonas_drifts",    email: "jonas@example.com",   password: "Password123" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
/** Cycles through an array: pick(arr, i) = arr[i % arr.length] */
const pick = (arr, i) => arr[i % arr.length];

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  await mongoose.connect(MONGO_URL);
  console.log("✅  Connected to MongoDB");

  // 1. Clear in safe dependency order
  await Review.deleteMany({});
  await Listing.deleteMany({});
  await User.deleteMany({});
  console.log("🗑   Cleared Reviews, Listings, Users");

  // 2. Create sample users via passport-local-mongoose (.register handles hashing)
  const createdUsers = [];
  for (const u of sampleUsers) {
    const user = new User({ username: u.username, email: u.email });
    const registered = await User.register(user, u.password);
    createdUsers.push(registered);
  }
  console.log(`👤  Created ${createdUsers.length} sample users`);

  // 3. Insert listings + reviews
  for (let i = 0; i < sampleListings.length; i++) {
    const listingData = sampleListings[i];
    const owner       = pick(createdUsers, i);

    // Build and save the listing first (we need its _id for reviews)
    const { reviewIndices, ...listingFields } = listingData;
    const listing = new Listing({ ...listingFields, owner: owner._id });
    await listing.save();

    // Create reviews for this listing
    const reviewIds = [];
    for (let j = 0; j < reviewIndices.length; j++) {
      const poolEntry = reviewPool[reviewIndices[j]];
      const author    = pick(createdUsers, i + j + 1); // offset so author ≠ owner usually
      const review    = new Review({
        rating:    poolEntry.rating,
        comment:   poolEntry.comment,
        author:    author._id,
        createdAt: randomPastDate(),
      });
      await review.save();
      reviewIds.push(review._id);
    }

    // Attach reviews to listing
    listing.review = reviewIds;
    await listing.save();
  }

  console.log(`🏡  Inserted ${sampleListings.length} listings with reviews`);
  console.log("🎉  Database initialised successfully");
}

/** Returns a random Date between 6 months ago and yesterday */
function randomPastDate() {
  const now   = Date.now();
  const sixMo = 1000 * 60 * 60 * 24 * 180;
  return new Date(now - Math.floor(Math.random() * sixMo));
}

// ─── Run ──────────────────────────────────────────────────────────────────────
main()
  .catch((err) => {
    console.error("❌  Seed failed:", err);
    process.exit(1);
  })
  .finally(() => mongoose.connection.close());