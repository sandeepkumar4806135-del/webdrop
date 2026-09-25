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

export type Platform = "windows" | "mac" | "android" | "ios" | "linux";

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
  // Linux check MUST come after the Android check: Android user agents also
  // contain "Linux" (e.g. "Linux; Android 14"), so a phone would otherwise be
  // misidentified as a Linux desktop. Linux desktop Chrome/Edge support the
  // same real beforeinstallprompt flow as Windows/Mac, so it reuses the
  // regular InstallButton (not the iOS instructions modal).
  if (/Linux/.test(ua)) return "linux";
  return null;
}

/**
 * Live check: is THIS browsing context running as an installed app RIGHT NOW?
 *
 * This answers "am I currently inside a standalone window", NOT "does the user
 * have the app installed on some device" — those are different questions. The
 * answer is always re-read from the browser (never cached or persisted), so it
 * can't go stale.
 */
export function isStandaloneNow(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  // navigator.standalone is iOS Safari's equivalent of standalone mode
  // (older iOS versions don't support the matchMedia query).
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    nav.standalone === true
  );
}

/** Current device's platform, client-side only (null during SSR / unknown). */
export function useDetectedPlatform(): Platform | null {
  const [platform, setPlatform] = useState<Platform | null>(null);
  useEffect(() => {
    // Deferred so client-only detection doesn't run synchronously in the
    // effect body (avoids SSR/hydration mismatch and cascading renders).
    const t = setTimeout(() => setPlatform(detectPlatform()), 0);
    return () => clearTimeout(t);
  }, []);
  return platform;
}

/**
 * Live, continuously-revalidated "is this context standalone" flag.
 *
 * Re-checked on mount AND on every display-mode change (the media query's
 * change event), so the UI always reflects the real current browser state
 * instead of a snapshot that could go stale.
 */
function useStandaloneNow(): boolean {
  const [standalone, setStandalone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(display-mode: standalone)");
    const update = () => setStandalone(isStandaloneNow());
    const t = setTimeout(update, 0);
    mq.addEventListener("change", update);
    return () => {
      clearTimeout(t);
      mq.removeEventListener("change", update);
    };
  }, []);
  return standalone;
}

/** Small badge shown only on the card matching the visitor's own device. */
export function RecommendedBadge({ platform }: { platform: Platform }) {
  const detected = useDetectedPlatform();
  if (detected !== platform) return null;
  return (
    <span className="rounded-full bg-[#3B5FE0]/10 px-2.5 py-1 text-xs font-semibold text-[#3B5FE0]">
      Recommended for your device
    </span>
  );
}

/**
 * Install button for the Windows / Mac / Android / Linux cards (Chromium
 * install prompt — Linux desktop Chrome/Edge support the same
 * beforeinstallprompt flow). `platform` scopes the card so the "Already
 * Installed" state can only ever appear on the card matching the device the visitor is ACTUALLY
 * using — other cards are unaffected.
 */
export function InstallButton({ platform }: { platform: Platform }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  // Give beforeinstallprompt a short grace period to fire before showing
  // the fallback UI, so it never flashes on browsers that will support it.
  const [graceOver, setGraceOver] = useState(false);
  const detected = useDetectedPlatform();
  const standalone = useStandaloneNow();

  // "Already Installed" is derived, never stored: it requires BOTH that the
  // device the visitor is currently using matches THIS card's platform AND
  // that the current browsing context is genuinely running standalone. A
  // regular browser tab on an installed device correctly shows Install again
  // (we can't know from a tab whether the app exists, and claiming it would
  // produce exactly the false "Already Installed" reports this replaces).
  const installed = detected === platform && standalone;

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // suppress the browser's own mini-infobar
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      // NOTE: deliberately NOT used to claim "Already Installed". Chrome on
      // Android has a documented history of firing `appinstalled` spuriously
      // (prematurely, or during WebAPK revalidation) on devices where nothing
      // was installed — trusting it here produced false "Already Installed"
      // states. Its only reliable use is dropping the one-shot prompt event.
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    // 2s grace period gives beforeinstallprompt time to fire before the
    // fallback UI shows.
    const timer = setTimeout(() => setGraceOver(true), 2000);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      clearTimeout(timer);
    };
  }, []);

  const handleClick = async () => {
    if (!deferred) return;
    await deferred.prompt(); // show the native install dialog
    // No "installed" claim here either: accepting the prompt installs the
    // app, but THIS context is still a browser tab (not standalone), so the
    // derived installed check stays false — accurate. The one-shot event is
    // consumed either way, so the fallback "Open WebDrop" UI takes over.
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
        href="/app"
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
  const detected = useDetectedPlatform();
  const standalone = useStandaloneNow();
  // Same derived rule as the Chromium cards: only claim "installed" when the
  // visitor's CURRENT device is iOS AND this context is genuinely running
  // standalone (navigator.standalone is the classic iOS signal; modern iOS
  // also supports the matchMedia query — isStandaloneNow checks both).
  const installed = detected === "ios" && standalone;

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