"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

/**
 * Client-side gate for the marketing homepage. Installed-PWA users launch the
 * app at "/" (the manifest's start_url, kept stable so existing installs keep
 * working), but they should land straight in the tool at /app — not on the
 * marketing page. This component checks standalone mode as early as possible
 * on mount and redirects before the landing content is ever shown.
 *
 * While the check runs (and during the redirect) only a blank background is
 * rendered, so regular browser visitors see at most a one-frame blank flash,
 * and installed users never see the marketing content flash first.
 */
export function StandaloneRedirect({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // navigator.standalone is the iOS Safari equivalent of standalone
    // display-mode (Safari didn't support the matchMedia query for years).
    const nav = navigator as Navigator & { standalone?: boolean };
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      nav.standalone === true;
    if (standalone) {
      router.replace("/app");
      return;
    }
    // Deferred to a microtask rather than called synchronously in the effect
    // body (React's set-state-in-effect rule); behavior is identical — the
    // blank placeholder shows until the synchronous check above completes.
    queueMicrotask(() => setChecked(true));
  }, [router]);

  if (!checked) {
    return <div className="min-h-screen bg-[#FAFBFC]" />;
  }
  return <>{children}</>;
}
