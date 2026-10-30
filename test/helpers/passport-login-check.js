/**
 * Verifies a username/password through the installed Passport Local model.
 * Used by the Python tests to prove FastAPI-created users also work in Express.
 *
 * Usage: node test/helpers/passport-login-check.js <mongodb-uri> <username> <password>
 */

const assert = require("node:assert/strict");
const { URL } = require("node:url");
const mongoose = require("mongoose");

const User = require("../../models/user");

async function main() {
  const [uri, username, password] = process.argv.slice(2);
  if (!uri || !username || password === undefined) {
    throw new Error("Expected a MongoDB URI, username, and password.");
  }

  const parsed = new URL(uri);
  assert.equal(parsed.protocol, "mongodb:", "Expected a mongodb:// URI");
  assert.ok(
    ["127.0.0.1", "localhost", "::1", "[::1]"].includes(parsed.hostname),
    "Cross-language checks may only use a local MongoDB server",
  );
  assert.ok(
    parsed.pathname.startsWith("/homestay_phase1_test_"),
    "Cross-language checks require a disposable test database",
  );

  await mongoose.connect(uri);
  try {
    const user = await User.findOne({ username }).select("+salt +hash");
    if (!user) {
      process.stdout.write(JSON.stringify({ ok: false, reason: "missing user" }));
      return;
    }

    const result = await user.authenticate(password);
    process.stdout.write(
      JSON.stringify({
        ok: Boolean(result.user),
        reason: result.error ? result.error.message : undefined,
      }),
    );
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
