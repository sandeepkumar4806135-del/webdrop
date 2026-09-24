"use client";

import {
  useDetectedPlatform,
  InstallButton,
  IosInstallButton,
  RecommendedBadge,
  type Platform,
} from "./InstallButton";

/**
 * Download section (landing page) — presentation only; all install logic
 * lives in InstallButton.tsx and is reused unchanged.
 *
 * Detects the visitor's actual current device client-side and renders a
 * SINGLE centered card for just that platform (icon + name + install
 * button), with dynamic supporting copy. If detection isn't confident
 * (null), it falls back to the original 4-card grid so nobody is ever
 * left without an install option.
 *
 * Must be a client component: app/page.tsx is a server component (it
 * exports `metadata`), so platform detection can't happen inline there.
 */

const PLATFORM_NAMES: Record<Platform, string> = {
  windows: "Windows",
  mac: "Mac",
  android: "Android",
  ios: "iPhone & iPad",
};

/**
 * Distinct, simple line-art icons per platform — generic silhouettes in the
 * site's electric blue (#3B5FE0 via currentColor), NOT trademarked logos:
 * Windows = four-pane square; Mac = apple-ish circle with a leaf;
 * Android = rounded square with antennae; iOS = phone silhouette.
 */
function PlatformIcon({ platform }: { platform: Platform }) {
  const shared = {
    width: 44,
    height: 44,
    viewBox: "0 0 24 24",
    fill: "none",
    "aria-hidden": true as const,
    className: "text-[#3B5FE0]",
  };
  switch (platform) {
    case "windows":
      return (
        <svg {...shared}>
          <rect x="3" y="3" width="8" height="8" rx="1.2" stroke="currentColor" strokeWidth="1.8" />
          <rect x="13" y="3" width="8" height="8" rx="1.2" stroke="currentColor" strokeWidth="1.8" />
          <rect x="3" y="13" width="8" height="8" rx="1.2" stroke="currentColor" strokeWidth="1.8" />
          <rect x="13" y="13" width="8" height="8" rx="1.2" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      );
    case "mac":
      return (
        <svg {...shared}>
          <circle cx="12" cy="14.5" r="6.5" stroke="currentColor" strokeWidth="1.8" />
          <path d="M12 8V5.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M12.2 5.8c.4-1.7 1.8-2.7 3.6-2.9-.2 2-1.4 3.1-3.6 2.9Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      );
    case "android":
      return (
        <svg {...shared}>
          <rect x="5" y="9" width="14" height="11" rx="3.5" stroke="currentColor" strokeWidth="1.8" />
          <path d="M8.5 9C8.5 6.8 9.6 5.3 11 4.5M15.5 9c0-2.2-1.1-3.7-2.5-4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="9.5" cy="14" r="0.9" fill="currentColor" />
          <circle cx="14.5" cy="14" r="0.9" fill="currentColor" />
        </svg>
      );
    case "ios":
      return (
        <svg {...shared}>
          <rect x="7" y="2.5" width="10" height="19" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
          <path d="M10.5 5h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="12" cy="18.5" r="1" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    default:
      return null;
  }
}

/** Single centered card for the one detected platform. */
function DetectedCard({ platform }: { platform: Platform }) {
  return (
    <div className="mx-auto flex w-full max-w-xs flex-col items-center gap-3 rounded-2xl border border-[#E6EAF2] bg-white p-6 text-center shadow-sm sm:max-w-sm">
      <PlatformIcon platform={platform} />
      <h3 className="font-[family-name:var(--font-space-grotesk)] text-lg font-bold text-[#1A1F2E]">
        {PLATFORM_NAMES[platform]}
      </h3>
      {platform === "ios" ? (
        <IosInstallButton />
      ) : (
        <InstallButton platform={platform} />
      )}
    </div>
  );
}


/** Original 4-card grid — shown only when platform detection isn't confident. */
function PlatformFallbackGrid() {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {/* Windows */}
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-[#E6EAF2] bg-white p-6 text-center">
        <RecommendedBadge platform="windows" />
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-[#3B5FE0]">
          <rect x="3" y="4" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="2" />
          <path d="M8 20h8M12 16v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <h3 className="font-[family-name:var(--font-space-grotesk)] text-lg font-bold text-[#1A1F2E]">Windows</h3>
        <InstallButton platform="windows" />
      </div>
      {/* Mac */}
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-[#E6EAF2] bg-white p-6 text-center">
        <RecommendedBadge platform="mac" />
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-[#3B5FE0]">
          <rect x="3" y="4" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="2" />
          <path d="M2 20h20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <h3 className="font-[family-name:var(--font-space-grotesk)] text-lg font-bold text-[#1A1F2E]">Mac</h3>
        <InstallButton platform="mac" />
      </div>
      {/* Android */}
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-[#E6EAF2] bg-white p-6 text-center">
        <RecommendedBadge platform="android" />
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-[#3B5FE0]">
          <rect x="7" y="2" width="10" height="20" rx="2" stroke="currentColor" strokeWidth="2" />
          <path d="M11 18h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <h3 className="font-[family-name:var(--font-space-grotesk)] text-lg font-bold text-[#1A1F2E]">Android</h3>
        <InstallButton platform="android" />
      </div>
      {/* iPhone & iPad */}
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-[#E6EAF2] bg-white p-6 text-center">
        <RecommendedBadge platform="ios" />
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-[#3B5FE0]">
          <rect x="7" y="2" width="10" height="20" rx="2" stroke="currentColor" strokeWidth="2" />
          <circle cx="12" cy="18" r="1" fill="currentColor" />
        </svg>
        <h3 className="font-[family-name:var(--font-space-grotesk)] text-lg font-bold text-[#1A1F2E]">iPhone &amp; iPad</h3>
        <IosInstallButton />
      </div>
    </div>
  );
}

export function DownloadSection() {
  // null during SSR and on the client's first render (no hydration
  // mismatch), then the detected platform after mount — so the 4-card
  // fallback doubles as the pre-detection state.
  const detected = useDetectedPlatform();

  return (
    <section
      id="download"
      className="w-full scroll-mt-16 border-t border-[#E6EAF2] bg-[#FAFBFC]"
    >
      <div className="mx-auto max-w-6xl px-6 py-16 text-center lg:py-20">
        <h2 className="font-[family-name:var(--font-space-grotesk)] text-3xl font-bold tracking-tight text-[#1A1F2E] sm:text-4xl">
          Get WebDrop on Your Device
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-[#5B6472]">
          {detected
            ? `We've detected you're on ${PLATFORM_NAMES[detected]} — install WebDrop with one tap.`
            : "No app stores required — WebDrop installs right from your browser as an app on Windows, Mac, Android, and iPhone/iPad."}
        </p>
        <div className="mt-10">
          {detected ? (
            <DetectedCard platform={detected} />
          ) : (
            <PlatformFallbackGrid />
          )}
        </div>
      </div>
    </section>
  );
}
