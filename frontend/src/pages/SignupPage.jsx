import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { useAuth } from "../auth";
import AuthShell from "../components/AuthShell";

const labelClass =
  "block text-[10px] font-bold uppercase tracking-[0.16em] text-sand";
const inputClass =
  "mt-1 w-full rounded-xl border border-clay bg-linen px-4 py-3 text-sm text-ink outline-none transition focus:border-earth";
const buttonClass =
  "w-full rounded-full bg-earth px-6 py-3 text-sm font-semibold text-linen transition hover:bg-ink disabled:cursor-not-allowed disabled:opacity-60";

export default function SignupPage() {
  const { user, status, signup } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (status === "loading") {
    return (
      <p className="mx-auto max-w-md px-4 py-24 text-center text-sm text-sand">
        Checking your session…
      </p>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!username.trim() || !email.trim()) {
      setError("Enter a username and email address.");
      return;
    }
    if (password.length < 8) {
      setError("Your password must be at least 8 characters.");
      return;
    }

    setError("");
    setSubmitting(true);
    try {
      await signup({ username, email, password });
      navigate("/", { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Create an account"
      subtitle="Join EazyInvites and start exploring"
      footerText="Already have an account?"
      footerLink="/login"
      footerLabel="Log in"
    >
      <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
        {error && (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        <div>
          <label className={labelClass} htmlFor="username">
            Username
          </label>
          <input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            required
            className={inputClass}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="email">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className={inputClass}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            className={inputClass}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <p className="mt-1 text-xs text-sand">Use at least 8 characters.</p>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className={buttonClass}
        >
          {submitting ? "Creating account…" : "Create account"}
        </button>
      </form>
    </AuthShell>
  );
}
