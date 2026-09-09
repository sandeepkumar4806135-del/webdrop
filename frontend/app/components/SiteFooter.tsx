"use client";

import { usePathname } from "next/navigation";

// Site-wide footer with a route-conditional theme.
// The /landing page uses a light theme, so the footer switches to light
// there too; every other page keeps the existing dark navy footer.
// (This has to be a client component because usePathname only works
// client-side, while the root layout itself is a server component.)
export function SiteFooter() {
  const pathname = usePathname();
  const isLanding = pathname === "/landing";

  if (isLanding) {
    return (
      <footer className="flex w-full flex-col items-center justify-center gap-1 bg-[#FAFBFC] px-4 pb-6 text-xs text-[#1A1F2E]">
        <div className="flex gap-4">
          <a
            href="/privacy"
            className="text-[#3B5FE0] transition-colors hover:text-[#2F4FC4] hover:underline"
          >
            Privacy Policy
          </a>
          <a
            href="/terms"
            className="text-[#3B5FE0] transition-colors hover:text-[#2F4FC4] hover:underline"
          >
            Terms of Service
          </a>
        </div>
        <p>© 2026 WebDrop</p>
      </footer>
    );
  }

  return (
    <footer className="flex w-full flex-col items-center justify-center gap-1 px-4 pb-6 text-xs text-[#8B93A7]">
      <div className="flex gap-4">
        <a href="/privacy" className="transition-colors hover:text-[#5B8DEF]">
          Privacy Policy
        </a>
        <a href="/terms" className="transition-colors hover:text-[#5B8DEF]">
          Terms of Service
        </a>
      </div>
      <p>© 2026 WebDrop</p>
    </footer>
  );
}
