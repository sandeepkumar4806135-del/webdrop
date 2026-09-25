"use client";

import Image from "next/image";
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
  linux: "Linux",
};

/** Real logo image per platform (all served from /public/icons). */
const PLATFORM_ICONS: Record<Platform, string> = {
  windows: "/icons/windows.png",
  mac: "/icons/apple.png",
  ios: "/icons/apple.png",
  android: "/icons/android.png",
  linux: "/icons/linux.png",
};

/**
 * Real logo image, identical fixed dimensions for every platform so all
 * cards look visually consistent regardless of each source image's
 * proportions (object-contain letterboxes inside the fixed box), centered
 * horizontally with the same spacing above the platform name.
 */
function PlatformLogo({ platform }: { platform: Platform }) {
  return (
    <Image
      src={PLATFORM_ICONS[platform]}
      alt={`${PLATFORM_NAMES[platform]} logo`}
      width={64}
      height={64}
      className="h-16 w-16 object-contain"
    />
  );
}

/** Single centered card for the one detected platform. */
function DetectedCard({ platform }: { platform: Platform }) {
  return (
    <div className="mx-auto flex w-full max-w-xs flex-col items-center gap-3 rounded-2xl border border-[#E6EAF2] bg-white p-6 text-center shadow-sm sm:max-w-sm">
      <PlatformLogo platform={platform} />
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
        <PlatformLogo platform="windows" />
        <h3 className="font-[family-name:var(--font-space-grotesk)] text-lg font-bold text-[#1A1F2E]">Windows</h3>
        <InstallButton platform="windows" />
      </div>
      {/* Mac */}
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-[#E6EAF2] bg-white p-6 text-center">
        <RecommendedBadge platform="mac" />
        <PlatformLogo platform="mac" />
        <h3 className="font-[family-name:var(--font-space-grotesk)] text-lg font-bold text-[#1A1F2E]">Mac</h3>
        <InstallButton platform="mac" />
      </div>
      {/* Android */}
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-[#E6EAF2] bg-white p-6 text-center">
        <RecommendedBadge platform="android" />
        <PlatformLogo platform="android" />
        <h3 className="font-[family-name:var(--font-space-grotesk)] text-lg font-bold text-[#1A1F2E]">Android</h3>
        <InstallButton platform="android" />
      </div>
      {/* iPhone & iPad */}
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-[#E6EAF2] bg-white p-6 text-center">
        <RecommendedBadge platform="ios" />
        <PlatformLogo platform="ios" />
        <h3 className="font-[family-name:var(--font-space-grotesk)] text-lg font-bold text-[#1A1F2E]">iPhone &amp; iPad</h3>
        <IosInstallButton />
      </div>
      {/* Linux — Linux desktop Chrome/Edge support the same real install
          prompt, so this card reuses InstallButton like Windows/Mac. */}
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-[#E6EAF2] bg-white p-6 text-center">
        <RecommendedBadge platform="linux" />
        <PlatformLogo platform="linux" />
        <h3 className="font-[family-name:var(--font-space-grotesk)] text-lg font-bold text-[#1A1F2E]">Linux</h3>
        <InstallButton platform="linux" />
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
