import { lazy, Suspense, useEffect, useState } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import {
  ArrowUpRight,
  HousePlus,
  LogIn,
  LogOut,
  Sparkles,
  UserPlus,
  UserRound,
} from "lucide-react";

import { useAuth } from "./auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./components/ui/dropdown-menu";
import BrowsePage from "./pages/BrowsePage";
import DetailPage from "./pages/DetailPage";
import ListingFormPage from "./pages/ListingFormPage";
import LoginPage from "./pages/LoginPage";
import MyListingsPage from "./pages/MyListingsPage";
import SignupPage from "./pages/SignupPage";

// Load the chat panel (and its AI SDK) only after the visitor opens it.
const ChatAssistant = lazy(() => import("./components/ChatAssistant"));

function SiteHeader() {
  const { user, status, logout } = useAuth();
  const location = useLocation();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [scrolled, setScrolled] = useState(false);

  // The home hero sits under the header, so the header starts transparent and
  // turns solid once the page scrolls. The logo and text keep the same colour
  // in both states so the brand does not change as the page moves.
  const overHero = location.pathname === "/" && !scrolled;
  const signedIn = status === "ready" && Boolean(user);

  useEffect(() => {
    function handleScroll() {
      setScrolled(window.scrollY > 24);
    }

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [location.pathname]);

  async function handleLogout() {
    setLogoutError("");
    setLoggingOut(true);
    try {
      await logout();
    } catch (error) {
      setLogoutError(error.message);
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <header
      className={`sticky top-0 z-20 border-b transition-colors duration-300 ${
        overHero
          ? "border-transparent bg-transparent"
          : "border-clay bg-linen/95 backdrop-blur"
      }`}
    >
      <div className="flex h-16 w-full items-center justify-between gap-3 px-4 sm:px-6 lg:px-10 2xl:px-14">
        <Link
          to="/"
          aria-label="EazyInvites home"
          className="shrink-0 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sand"
        >
          <img
            src="/brand/eazyinvite-logo.svg"
            alt="EazyInvites"
            width="1070"
            height="273"
            className="h-8 w-auto sm:h-9"
          />
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={
                signedIn ? `Account menu for ${user.username}` : "Account menu"
              }
              className="inline-flex size-10 items-center justify-center rounded-full border border-clay bg-white/70 text-earth shadow-sm transition hover:border-sand hover:bg-white hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sand"
            >
              <UserRound className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {signedIn ? (
              <>
                <DropdownMenuLabel>
                  <span className="block text-[10px] font-bold tracking-[0.16em] text-sand uppercase">
                    Signed in as
                  </span>
                  <span className="mt-0.5 block truncate font-display text-sm font-bold text-ink">
                    @{user.username}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/my-listings">My listings</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/listings/new">
                    <HousePlus className="size-4" />
                    Add listing
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={loggingOut}
                  onSelect={() => {
                    handleLogout();
                  }}
                  className="text-red-700 focus:bg-red-50 focus:text-red-800"
                >
                  <LogOut className="size-4" />
                  {loggingOut ? "Logging out…" : "Log out"}
                </DropdownMenuItem>
              </>
            ) : (
              <>
                <DropdownMenuLabel>
                  <span className="block text-[10px] font-bold tracking-[0.16em] text-sand uppercase">
                    Welcome
                  </span>
                  <span className="mt-0.5 block font-display text-sm font-bold text-ink">
                    Find your next stay
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/login">
                    <LogIn className="size-4" />
                    Log in
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/signup">
                    <UserPlus className="size-4" />
                    Sign up
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/listings/new">
                    <HousePlus className="size-4" />
                    List your home
                  </Link>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {logoutError && (
        <p
          role="alert"
          className="border-t border-red-100 bg-red-50 px-4 py-2 text-center text-xs text-red-700"
        >
          {logoutError}
        </p>
      )}
    </header>
  );
}

const FOOTER_CATEGORIES = [
  "Coastal Haven",
  "Mountain Escape",
  "Heritage Homestay",
  "Houseboat",
];

const FOOTER_LINK_CLASS =
  "inline-flex w-fit items-center text-sm text-ink/70 transition hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-earth";

function SiteFooter({ onOpenChat }) {
  const year = new Date().getFullYear();

  return (
    <footer className="relative mt-20 overflow-hidden border-t border-earth/10 bg-clay text-ink">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-earth/30 to-transparent"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -bottom-32 size-96 rounded-full bg-earth/10 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-32 top-0 size-80 rounded-full bg-sand/30 blur-3xl"
      />

      <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:py-16">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[1.7fr_1fr_1fr_1.1fr] lg:gap-8">
          <div className="max-w-sm">
            <img
              src="/brand/eazyinvite-lockup-stays-hotels.svg"
              alt="EazyInvites — stays and hotels"
              width="1343"
              height="273"
              className="h-11 w-auto"
            />
            <p className="mt-6 text-sm leading-relaxed text-ink/65">
              Thoughtfully chosen homes for travellers who care how a place
              feels. Every stay is picked for its setting, its character, and
              the welcome that awaits.
            </p>
            <p className="mt-6 flex items-center gap-2 text-[10px] font-bold tracking-[0.22em] text-earth uppercase">
              <span className="h-px w-6 bg-earth/40" />
              Curated stays, not listings
            </p>
          </div>

          <nav aria-label="Explore stays">
            <h2 className="text-[10px] font-bold tracking-[0.22em] text-earth uppercase">
              Explore
            </h2>
            <ul className="mt-5 space-y-3">
              <li>
                <Link to="/#all-stays" className={FOOTER_LINK_CLASS}>
                  All stays
                </Link>
              </li>
              {FOOTER_CATEGORIES.map((name) => (
                <li key={name}>
                  <Link
                    to={`/?category=${encodeURIComponent(name)}#all-stays`}
                    className={FOOTER_LINK_CLASS}
                  >
                    {name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Hosting">
            <h2 className="text-[10px] font-bold tracking-[0.22em] text-earth uppercase">
              Hosting
            </h2>
            <ul className="mt-5 space-y-3">
              <li>
                <Link to="/listings/new" className={FOOTER_LINK_CLASS}>
                  List your home
                </Link>
              </li>
              <li>
                <Link to="/my-listings" className={FOOTER_LINK_CLASS}>
                  My listings
                </Link>
              </li>
              <li>
                <Link to="/signup" className={FOOTER_LINK_CLASS}>
                  Create an account
                </Link>
              </li>
              <li>
                <Link to="/login" className={FOOTER_LINK_CLASS}>
                  Log in
                </Link>
              </li>
            </ul>
          </nav>

          <div>
            <h2 className="text-[10px] font-bold tracking-[0.22em] text-earth uppercase">
              Mira
            </h2>
            <p className="mt-5 text-sm leading-relaxed text-ink/65">
              Looking for a quiet coast, a mountain hideout, or a heritage
              home? Mira, our AI concierge, knows every stay.
            </p>
            <button
              type="button"
              onClick={onOpenChat}
              className="mt-5 inline-flex items-center gap-2 rounded-full border border-earth/25 bg-white/60 px-4 py-2 text-xs font-semibold text-earth transition hover:border-earth hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-earth"
            >
              <Sparkles className="size-3.5" />
              Ask Mira
              <ArrowUpRight className="size-3.5 text-earth" />
            </button>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-earth/15 pt-6 text-[11px] text-earth/70 sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} EazyInvites. All rights reserved.</p>
          <p className="text-[10px] font-semibold tracking-[0.2em] uppercase">
            Stays &amp; hotels, thoughtfully curated
          </p>
        </div>
      </div>
    </footer>
  );
}

function NotFoundPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
      <h1 className="font-display text-3xl font-bold text-ink">
        Page not found
      </h1>
      <Link
        to="/"
        className="mt-6 inline-block rounded-full bg-earth px-6 py-3 text-sm font-semibold text-linen transition hover:bg-ink"
      >
        Browse stays
      </Link>
    </div>
  );
}

export default function App() {
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMounted, setChatMounted] = useState(false);

  function openChat() {
    setChatMounted(true);
    setChatOpen(true);
  }

  return (
    <div className="flex min-h-screen flex-col bg-linen text-ink">
      <SiteHeader />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<BrowsePage />} />
          <Route path="/listings/new" element={<ListingFormPage />} />
          <Route
            path="/listings/:listingId/edit"
            element={<ListingFormPage />}
          />
          <Route path="/listings/:listingId" element={<DetailPage />} />
          <Route path="/my-listings" element={<MyListingsPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <SiteFooter onOpenChat={openChat} />

      <button
        type="button"
        onClick={openChat}
        aria-label="Ask Mira, the EazyInvites concierge"
        aria-haspopup="dialog"
        aria-expanded={chatOpen}
        className="group fixed right-4 bottom-4 z-30 inline-flex size-14 items-center justify-center rounded-full bg-linear-to-br from-earth to-ink text-linen shadow-lg shadow-ink/25 ring-1 ring-white/20 transition hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-earth sm:right-6 sm:bottom-6"
      >
        <span className="pointer-events-none absolute right-full mr-3 hidden whitespace-nowrap rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-linen opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-visible:opacity-100 lg:block">
          Ask Mira
        </span>
        <Sparkles className="size-5" />
      </button>

      {chatMounted && (
        <Suspense fallback={null}>
          <ChatAssistant open={chatOpen} onOpenChange={setChatOpen} />
        </Suspense>
      )}
    </div>
  );
}
