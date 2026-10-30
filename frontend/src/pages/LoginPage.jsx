import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";

import { useAuth } from "../auth";
import AuthShell from "../components/AuthShell";

const labelClass =
  "block text-[10px] font-bold uppercase tracking-[0.16em] text-sand";
const inputClass =
  "mt-1 w-full rounded-xl border border-clay bg-linen px-4 py-3 text-sm text-ink outline-none transition focus:border-earth";
const buttonClass =
  "w-full rounded-full bg-earth px-6 py-3 text-sm font-semibold text-linen transition hover:bg-ink disabled:cursor-not-allowed disabled:opacity-60";

export default function LoginPage() {
  const { user, status, login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Only follow local paths so a crafted link cannot redirect off-site.
  const requestedPath = searchParams.get("next");
  const nextPath =
    requestedPath && requestedPath.startsWith("/") && !requestedPath.startsWith("//")
      ? requestedPath
      : "/";

  if (status === "loading") {
    return (
      <p className="mx-auto max-w-md px-4 py-24 text-center text-sm text-sand">
        Checking your session…
      </p>
    );
  }

  if (user) {
    return <Navigate to={nextPath} replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!username.trim() || !password) {
      setError("Enter your username and password.");
      return;
    }

    setError("");
    setSubmitting(true);
    try {
      await login({ username, password });
      navigate(nextPath, { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your EazyInvites account"
      footerText="Don't have an account?"
      footerLink="/signup"
      footerLabel="Sign up"
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
          <label className={labelClass} htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className={inputClass}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className={buttonClass}
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </AuthShell>
  );
}
