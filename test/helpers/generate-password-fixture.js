/**
 * Prints a password hash created by the installed passport-local-mongoose
 * plugin. Used by the Python tests to prove cross-language compatibility.
 *
 * Usage: node test/helpers/generate-password-fixture.js [password]
 */

const User = require("../../models/user");

async function main() {
  const password = process.argv[2] || "FixturePassword123!";
  const user = new User({
    username: "python_compatibility_fixture",
    email: "fixture@example.test",
  });
  await user.setPassword(password);

  process.stdout.write(
    JSON.stringify({
      password,
      salt: user.get("salt"),
      hash: user.get("hash"),
    }),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
