"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * InstallButton + related pieces for the landing page's Download section.
 *
 * How install works per platform:
 * - Windows / Mac / Android (Chromium browsers): the browser fires a
 *   `beforeinstallprompt` event once the PWA installability criteria are met
 *   (HTTPS + manifest + service worker — already set up in this project).
 *   We capture that event, stop the browser's default mini-infobar, and use
 *   it to show the native install dialog when our button is clicked.
 * - iPhone / iPad (iOS Safari): `beforeinstallprompt` does not exist there.
 *   The iOS variant instead shows a small modal with manual
 *   "Add to Home Screen" instructions.
 * - Fallback: if the event never fires (unsupported browser, or criteria not
 *   met), the button degrades into a plain link to "/" with a short hint, so
 *   it is never broken or dead.
 */

type Platform = "windows" | "mac" | "android" | "ios";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function detectPlatform(): Platform | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;
  // iPadOS 13+ reports itself as "Macintosh" with touch support.
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  if (isIOS) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Windows/.test(ua)) return "windows";
  if (/Macintosh/.test(ua)) return "mac";
  return null;
}

/** Small badge shown only on the card matching the visitor's own device. */
export function RecommendedBadge({ platform }: { platform: Platform }) {
  const [detected, setDetected] = useState<Platform | null>(null);
  useEffect(() => {
    // Deferred so this client-only detection doesn't run synchronously in
    // the effect body (avoids SSR/hydration mismatch and cascading renders).
    const t = setTimeout(() => setDetected(detectPlatform()), 0);
    return () => clearTimeout(t);
  }, []);
  if (detected !== platform) return null;
  return (
    <span className="rounded-full bg-[#3B5FE0]/10 px-2.5 py-1 text-xs font-semibold text-[#3B5FE0]">
      Recommended for your device
    </span>
  );
}

/**
 * Install button for Windows / Mac / Android cards (Chromium install prompt).
 */
export function InstallButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [installed, setInstalled] = useState(false);
  // Give beforeinstallprompt a short grace period to fire before showing
  // the fallback UI, so it never flashes on browsers that will support it.
  const [graceOver, setGraceOver] = useState(false);

  useEffect(() => {
    const checkStandalone = () => {
      const nav = navigator as Navigator & { standalone?: boolean };
      // Already running as an installed app (standalone display mode, or the
      // iOS-specific navigator.standalone flag)?
      if (
        window.matchMedia("(display-mode: standalone)").matches ||
        nav.standalone === true
      ) {
        setInstalled(true);
      }
    };
    const onPrompt = (e: Event) => {
      e.preventDefault(); // suppress the browser's own mini-infobar
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    // Standalone check deferred out of the effect body; the 2s grace period
    // gives beforeinstallprompt time to fire before showing the fallback.
    const t0 = setTimeout(checkStandalone, 0);
    const timer = setTimeout(() => setGraceOver(true), 2000);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      clearTimeout(t0);
      clearTimeout(timer);
    };
  }, []);

  const handleClick = async () => {
    if (!deferred) return;
    await deferred.prompt(); // show the native install dialog
    const choice = await deferred.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    // The event can only be used once — drop it either way.
    setDeferred(null);
  };

  if (installed) {
    return (
      <button
        disabled
        className="w-full cursor-default rounded-lg bg-[#E6EAF2] px-4 py-2.5 text-sm font-semibold text-[#5B6472]"
      >
        Already Installed
      </button>
    );
  }

  if (deferred) {
    return (
      <button
        onClick={handleClick}
        className="w-full rounded-lg bg-[#3B5FE0] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#2F4FC4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B5FE0] focus-visible:ring-offset-2 focus-visible:ring-offset-white"
      >
        Install App
      </button>
    );
  }

  if (!graceOver) {
    return (
      <button
        disabled
        className="w-full cursor-wait rounded-lg border border-[#C9D2E3] bg-white px-4 py-2.5 text-sm font-semibold text-[#5B6472]"
      >
        Checking…
      </button>
    );
  }

  // Fallback: no install prompt available in this browser.
  return (
    <div className="flex w-full flex-col gap-1.5">
      <Link
        href="/"
        className="w-full rounded-lg border border-[#C9D2E3] bg-white px-4 py-2.5 text-center text-sm font-semibold text-[#1A1F2E] transition-colors hover:border-[#3B5FE0] hover:text-[#3B5FE0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B5FE0] focus-visible:ring-offset-2 focus-visible:ring-offset-white"
      >
        Open WebDrop
      </Link>
      <p className="text-xs leading-snug text-[#5B6472]">
        Open WebDrop, then use your browser&apos;s install option.
      </p>
    </div>
  );
}

/**
 * iOS / iPadOS card button: Safari has no beforeinstallprompt, so this shows
 * a small modal with numbered "Add to Home Screen" instructions instead.
 */
export function IosInstallButton() {
  const [open, setOpen] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const checkStandalone = () => {
      const nav = navigator as Navigator & { standalone?: boolean };
      if (
        window.matchMedia("(display-mode: standalone)").matches ||
        nav.standalone === true
      ) {
        setInstalled(true);
      }
    };
    // Deferred out of the effect body (see InstallButton note above).
    const t = setTimeout(checkStandalone, 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (installed) {
    return (
      <button
        disabled
        className="w-full cursor-default rounded-lg bg-[#E6EAF2] px-4 py-2.5 text-sm font-semibold text-[#5B6472]"
      >
        Already Installed
      </button>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-lg bg-[#3B5FE0] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#2F4FC4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B5FE0] focus-visible:ring-offset-2 focus-visible:ring-offset-white"
      >
        Add to Home Screen
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A1F2E]/50 p-4"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Add WebDrop to your iPhone or iPad home screen"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-[family-name:var(--font-space-grotesk)] text-lg font-bold text-[#1A1F2E]">
              Install on iPhone &amp; iPad
            </h3>
            <ol className="mt-4 flex list-decimal flex-col gap-3 pl-5 text-sm leading-relaxed text-[#1A1F2E]">
              <li>Open this page in Safari.</li>
              <li className="flex items-start gap-2">
                <span className="flex items-center gap-1.5">
                  Tap the Share icon
                  {/* Approximation of the standard iOS share icon:
                      a square with an arrow pointing up out of it. */}
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                    className="inline shrink-0 text-[#3B5FE0]"
                  >
                    <path
                      d="M12 3v12M8 7l4-4 4 4"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <rect
                      x="5"
                      y="11"
                      width="14"
                      height="10"
                      rx="2"
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                  </svg>
                </span>
              </li>
              <li>Tap &ldquo;Add to Home Screen&rdquo;.</li>
            </ol>
            <button
              onClick={() => setOpen(false)}
              className="mt-5 w-full rounded-lg border border-[#C9D2E3] bg-white px-4 py-2.5 text-sm font-semibold text-[#1A1F2E] transition-colors hover:border-[#3B5FE0] hover:text-[#3B5FE0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B5FE0] focus-visible:ring-offset-2 focus-visible:ring-offset-white"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}