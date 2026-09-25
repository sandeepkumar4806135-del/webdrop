import type { Metadata } from "next";
import Link from "next/link";
import { DownloadSection } from "./components/DownloadSection";
import { FaqAccordion } from "./components/FaqAccordion";
import { ContactForm } from "./components/ContactForm";
import { StandaloneRedirect } from "./components/StandaloneRedirect";

export const metadata: Metadata = {
  title: "WebDrop — Instant File Transfer, Any Device",
  description:
    "Send files, photos, videos, and text instantly between any two devices. Peer-to-peer, no login, no cables, no size limits — works across networks.",
};

const NAV_LINKS = [
  { label: "How It Works", href: "#how-it-works" },
  { label: "Download", href: "#download" },
  { label: "FAQ", href: "#faq" },
  { label: "Contact", href: "#contact" },
];

export default function LandingPage() {
  return (
    <StandaloneRedirect>
      <div className="w-full flex-1 bg-[#FAFBFC] font-[family-name:var(--font-inter)] text-[#1A1F2E]">
      {/* Top navigation bar */}
      <header className="w-full border-b border-[#E6EAF2]">
        <nav className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <Link
            href="/"
            className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B5FE0] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFBFC]"
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 28 28"
              fill="none"
              className="shrink-0"
              aria-hidden="true"
            >
              <path
                d="M6 14a8 8 0 0 1 16 0"
                stroke="#3B5FE0"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <path
                d="M10 14a4 4 0 0 1 8 0"
                stroke="#3B5FE0"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <circle cx="14" cy="14" r="2" fill="#3B5FE0" />
            </svg>
            <span className="font-[family-name:var(--font-space-grotesk)] text-xl font-bold tracking-tight text-[#1A1F2E]">
              WebDrop
            </span>
          </Link>
          <div className="hidden items-center gap-7 md:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-[#5B6472] transition-colors hover:text-[#1A1F2E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B5FE0] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFBFC]"
              >
                {link.label}
              </a>
            ))}
          </div>
        </nav>
        <nav className="flex items-center justify-center gap-6 border-t border-[#E6EAF2] px-6 py-3 md:hidden">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-[#5B6472] transition-colors hover:text-[#1A1F2E]"
            >
              {link.label}
            </a>
          ))}
        </nav>
      </header>

      {/* Hero section */}
      <section className="mx-auto grid w-full max-w-6xl gap-10 px-6 pb-20 pt-12 md:pt-16 lg:grid-cols-2 lg:items-center lg:gap-14 lg:pt-20">
        <div className="flex flex-col items-start gap-6">
          <h1 className="font-[family-name:var(--font-space-grotesk)] text-4xl font-bold leading-[1.1] tracking-tight text-[#1A1F2E] sm:text-5xl lg:text-[3.4rem]">
            Send Anything, Instantly. No Cables. No Cloud. No Limits.
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-[#5B6472]">
            WebDrop moves files, photos, videos, and text between any two
            devices over a direct peer-to-peer connection. No login, no size
            limits, works across networks.
          </p>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link
              href="/app"
              className="inline-flex items-center justify-center rounded-lg bg-[#3B5FE0] px-7 py-3.5 text-base font-semibold text-white transition-colors hover:bg-[#2F4FC4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B5FE0] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFBFC]"
            >
              Launch WebDrop
            </Link>
            <a
              href="#download"
              className="inline-flex items-center justify-center rounded-lg border border-[#C9D2E3] bg-white px-7 py-3.5 text-base font-semibold text-[#1A1F2E] transition-colors hover:border-[#3B5FE0] hover:text-[#3B5FE0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B5FE0] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFBFC]"
            >
              Download App
            </a>
          </div>
        </div>

        {/* Hero visual: the full WebDrop flow in one continuous 6s loop —
            searching (dots pulse) → pairing (dashed line + code) →
            transferring (solid line + file slides across). Pure CSS
            animation; falls back to a static connected state when the
            user has reduced motion enabled. */}
        <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-[#E2E8F0] bg-[#EEF2F7] p-6 sm:p-8 lg:min-h-[420px]">
          <svg
            viewBox="0 0 480 320"
            fill="none"
            aria-hidden="true"
            className="h-auto w-full max-w-md"
          >
            {/* ── Left device ── */}
            <rect
              x="36"
              y="90"
              width="80"
              height="140"
              rx="12"
              fill="white"
              stroke="#C9D2E3"
              strokeWidth="2"
            />
            <rect x="48" y="104" width="56" height="6" rx="3" fill="#E2E8F0" />
            <circle className="hero-dot" cx="76" cy="165" r="9" fill="#3B5FE0" />

            {/* ── Right device ── */}
            <rect
              x="364"
              y="90"
              width="80"
              height="140"
              rx="12"
              fill="white"
              stroke="#C9D2E3"
              strokeWidth="2"
            />
            <rect x="376" y="104" width="56" height="6" rx="3" fill="#E2E8F0" />
            <circle className="hero-dot" cx="404" cy="165" r="9" fill="#3B5FE0" />

            {/* ── Connector: dashed (pairing phase) over solid (transfer) ── */}
            <line
              className="hero-dash"
              x1="120"
              y1="160"
              x2="360"
              y2="160"
              stroke="#3B5FE0"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <line
              className="hero-solid"
              x1="120"
              y1="160"
              x2="360"
              y2="160"
              stroke="#3B5FE0"
              strokeWidth="2.5"
              strokeLinecap="round"
            />

            {/* ── Pairing code card (pairing phase) ── */}
            <g className="hero-code">
              <rect
                x="192"
                y="122"
                width="96"
                height="76"
                rx="12"
                fill="white"
                stroke="#3B5FE0"
                strokeWidth="2"
              />
              <text
                x="240"
                y="168"
                textAnchor="middle"
                fontSize="20"
                fontWeight="700"
                fill="#1A1F2E"
                fontFamily="var(--font-space-grotesk), sans-serif"
              >
                4821
              </text>
            </g>

            {/* ── File icon traveling across the connection (transfer phase) ── */}
            <g className="hero-file">
              <rect
                x="126"
                y="140"
                width="26"
                height="32"
                rx="4"
                fill="white"
                stroke="#3B5FE0"
                strokeWidth="2"
              />
              <path
                d="M132 140v7a2 2 0 0 0 2 2h13"
                stroke="#3B5FE0"
                strokeWidth="1.5"
                fill="none"
              />
              <line
                x1="132"
                y1="156"
                x2="146"
                y2="156"
                stroke="#3B5FE0"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <line
                x1="132"
                y1="162"
                x2="146"
                y2="162"
                stroke="#3B5FE0"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </g>
          </svg>
        </div>
      </section>

      {/* See WebDrop in Action — looping product video showcase.
          Placed between the hero and How It Works. autoPlay + muted +
          playsInline + loop: muted is mandatory for autoplay policies
          (especially mobile Safari/Chrome); no controls — this is a
          background-style showcase, not a player. Explicit width/height
          attributes (1280x720 16:9 landscape source) prevent layout
          shift while loading. */}
      <section
        id="see-it-in-action"
        className="w-full scroll-mt-16 border-t border-[#E6EAF2] bg-[#FAFBFC]"
      >
        <div className="mx-auto max-w-6xl px-6 py-16 text-center lg:py-20">
          <h2 className="font-[family-name:var(--font-space-grotesk)] text-3xl font-bold tracking-tight text-[#1A1F2E] sm:text-4xl">
            See WebDrop in Action
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-[#5B6472]">
            A quick look at instant, cable-free transfers.
          </p>
          <div className="mx-auto mt-10 w-full max-w-3xl overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-sm">
            <video
              src="/videos/webdrop-intro.mp4"
              autoPlay
              loop
              muted
              playsInline
              width={1280}
              height={720}
              className="block h-auto w-full"
            />
          </div>
        </div>
      </section>

      {/* How It Works — 3-step visual walkthrough */}
      <section
        id="how-it-works"
        className="w-full scroll-mt-16 border-t border-[#E6EAF2] bg-white"
      >
        <div className="mx-auto w-full max-w-6xl px-6 py-16 lg:py-20">
          <h2 className="text-center font-[family-name:var(--font-space-grotesk)] text-3xl font-bold tracking-tight text-[#1A1F2E] sm:text-4xl">
            How WebDrop Works
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-base leading-relaxed text-[#5B6472]">
            Three quick steps — no accounts, no installs, no cables.
          </p>
          <div className="mt-10 grid gap-6 md:grid-cols-3 lg:gap-8">
            {/* STEP 1 — both devices ready and searching */}
            <div className="flex flex-col items-center rounded-2xl border border-[#E6EAF2] bg-[#FAFBFC] p-6 text-center">
              <svg width="200" height="120" viewBox="0 0 200 120" fill="none" aria-hidden="true">
                <rect x="25" y="25" width="48" height="70" rx="8" fill="white" stroke="#C9D2E3" strokeWidth="2" />
                <rect x="33" y="34" width="32" height="4" rx="2" fill="#E2E8F0" />
                <circle className="landing-pulse-dot" cx="49" cy="66" r="7" fill="#3B5FE0" />
                <rect x="127" y="25" width="48" height="70" rx="8" fill="white" stroke="#C9D2E3" strokeWidth="2" />
                <rect x="135" y="34" width="32" height="4" rx="2" fill="#E2E8F0" />
                <circle className="landing-pulse-dot landing-pulse-dot-delay" cx="151" cy="66" r="7" fill="#3B5FE0" />
              </svg>
              <p className="mt-2 text-xs font-semibold uppercase tracking-widest text-[#3B5FE0]">Step 1</p>
              <h3 className="mt-1 font-[family-name:var(--font-space-grotesk)] text-lg font-bold text-[#1A1F2E]">Open on Both Devices</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#5B6472]">Open WebDrop in the browser on both devices — nothing to install, just both ready.</p>
            </div>
            {/* STEP 2 — pair with code or QR, signal traveling */}
            <div className="flex flex-col items-center rounded-2xl border border-[#E6EAF2] bg-[#FAFBFC] p-6 text-center">
              <svg width="200" height="120" viewBox="0 0 200 120" fill="none" aria-hidden="true">
                <line className="landing-dash-line" x1="58" y1="60" x2="142" y2="60" stroke="#3B5FE0" strokeWidth="2" strokeLinecap="round" />
                <rect x="15" y="30" width="40" height="60" rx="8" fill="white" stroke="#C9D2E3" strokeWidth="2" />
                <rect x="145" y="30" width="40" height="60" rx="8" fill="white" stroke="#C9D2E3" strokeWidth="2" />
                <rect x="78" y="44" width="44" height="32" rx="8" fill="white" stroke="#3B5FE0" strokeWidth="2" />
                <text x="100" y="65" textAnchor="middle" fontSize="12" fontWeight="700" fill="#1A1F2E" fontFamily="var(--font-space-grotesk), sans-serif">4821</text>
              </svg>
              <p className="mt-2 text-xs font-semibold uppercase tracking-widest text-[#3B5FE0]">Step 2</p>
              <h3 className="mt-1 font-[family-name:var(--font-space-grotesk)] text-lg font-bold text-[#1A1F2E]">Pair with a Code or QR</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#5B6472]">One side shows a 4-digit code and QR — enter or scan it on the other to link them.</p>
            </div>
            {/* STEP 3 — file sliding across a solid connection */}
            <div className="flex flex-col items-center rounded-2xl border border-[#E6EAF2] bg-[#FAFBFC] p-6 text-center">
              <svg width="200" height="120" viewBox="0 0 200 120" fill="none" aria-hidden="true">
                <line x1="58" y1="60" x2="142" y2="60" stroke="#3B5FE0" strokeWidth="2.5" strokeLinecap="round" />
                <rect x="15" y="30" width="40" height="60" rx="8" fill="white" stroke="#C9D2E3" strokeWidth="2" />
                <rect x="145" y="30" width="40" height="60" rx="8" fill="white" stroke="#C9D2E3" strokeWidth="2" />
                <g className="landing-file-move">
                  <rect x="70" y="47" width="18" height="22" rx="3" fill="white" stroke="#3B5FE0" strokeWidth="2" />
                  <path d="M74 47v5a2 2 0 0 0 2 2h12" stroke="#3B5FE0" strokeWidth="1.5" fill="none" />
                  <line x1="74" y1="59" x2="84" y2="59" stroke="#3B5FE0" strokeWidth="1.5" strokeLinecap="round" />
                </g>
              </svg>
              <p className="mt-2 text-xs font-semibold uppercase tracking-widest text-[#3B5FE0]">Step 3</p>
              <h3 className="mt-1 font-[family-name:var(--font-space-grotesk)] text-lg font-bold text-[#1A1F2E]">Transfer Instantly</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#5B6472]">Send files, photos, videos, or text straight across — direct and encrypted.</p>
            </div>
          </div>
        </div>
      </section>
      {/* Download / install section — client component (platform detection).
          Renders a single card for the visitor's detected device, falling
          back to the 4-card grid when detection isn't confident. */}
      <DownloadSection />
      {/* FAQ section — the nav "FAQ" link scrolls here. The accordion
          itself is a client component (FaqAccordion) so this page stays
          a server component. */}
      <section
        id="faq"
        className="w-full scroll-mt-16 border-t border-[#E6EAF2] bg-white"
      >
        <div className="mx-auto max-w-6xl px-6 py-16 text-center lg:py-20">
          <h2 className="font-[family-name:var(--font-space-grotesk)] text-3xl font-bold tracking-tight text-[#1A1F2E] sm:text-4xl">
            Frequently Asked Questions
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-[#5B6472]">
            Everything you need to know about how WebDrop works.
          </p>
          <FaqAccordion />
        </div>
      </section>
      {/* Contact section — last section on the page (above the footer);
          the nav "Contact" link scrolls here. The form itself is a client
          component (ContactForm) so this page stays a server component. */}
      <section
        id="contact"
        className="w-full scroll-mt-16 border-t border-[#E6EAF2] bg-[#FAFBFC]"
      >
        <div className="mx-auto max-w-6xl px-6 py-16 text-center lg:py-20">
          <h2 className="font-[family-name:var(--font-space-grotesk)] text-3xl font-bold tracking-tight text-[#1A1F2E] sm:text-4xl">
            Get in Touch
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-[#5B6472]">
            Questions, feedback, or something not working right? Let us know.
          </p>
          <div className="mt-10">
            <ContactForm />
          </div>
        </div>
      </section>
      </div>
    </StandaloneRedirect>
  );
}
