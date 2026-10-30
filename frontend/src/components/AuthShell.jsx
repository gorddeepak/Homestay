import { Link } from "react-router-dom";

export default function AuthShell({
  title,
  subtitle,
  children,
  footerText,
  footerLink,
  footerLabel,
}) {
  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <div className="rounded-3xl border border-clay bg-white/70 p-7 shadow-sm sm:p-10">
        <img
          src="/brand/eazyinvite-logo.svg"
          alt="EazyInvites"
          width="1070"
          height="273"
          className="h-7 w-auto"
        />
        <h1 className="mt-2 font-display text-3xl font-bold text-ink">
          {title}
        </h1>
        <p className="mt-2 text-sm text-sand">{subtitle}</p>
        {children}
      </div>

      <p className="mt-5 text-center text-sm text-sand">
        {footerText}{" "}
        <Link
          to={footerLink}
          className="font-semibold text-earth hover:text-ink"
        >
          {footerLabel}
        </Link>
      </p>
    </div>
  );
}
