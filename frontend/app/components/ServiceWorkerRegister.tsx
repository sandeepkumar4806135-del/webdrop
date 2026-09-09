"use client";

import { useEffect } from "react";

// Registers the minimal PWA service worker (/sw.js). Client-only on purpose:
// navigator.serviceWorker doesn't exist during SSR. Registration failures are
// swallowed (e.g. unsupported browser) so the app still works as a normal site.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // PWA installability is a nice-to-have; never break the app over it.
      });
    }
  }, []);
  return null;
}
