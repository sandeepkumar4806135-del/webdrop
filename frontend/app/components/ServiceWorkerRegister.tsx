"use client";

import { useEffect } from "react";

/* Registers the PWA service worker (/sw.js) and keeps installed PWAs fresh.
   Client-only on purpose: navigator.serviceWorker doesn't exist during SSR.
   Registration failures are swallowed (e.g. unsupported browser) so the app
   still works as a normal site.

   Auto-update flow: when the browser discovers a NEWER sw.js (new cache
   version), it installs it in the background and holds it in "waiting"
   state. We tell it to skipWaiting() immediately, and when the new worker
   takes control (controllerchange) we reload once so the open app swaps to
   the newly deployed version without the user having to force-refresh. The
   local "reloading" flag prevents a double reload in the same visit. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let reloading = false;

    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      // The new worker just took control — reload once to render the new
      // version's HTML/assets in this already-open instance.
      window.location.reload();
    };

    const onStateChange = (ev: Event) => {
      const worker = ev.target as ServiceWorker | null;
      // A new worker that finished installing and is waiting to take over:
      // tell it to activate immediately.
      if (
        worker &&
        navigator.serviceWorker.controller &&
        worker.state === "installed"
      ) {
        worker.postMessage({ type: "SKIP_WAITING" });
      }
    };

    const register = async () => {
      const reg = await navigator.serviceWorker.register("/sw.js").catch(() => {
        // PWA installability is a nice-to-have; never break the app over it.
        return null;
      });
      if (!reg) return;

      navigator.serviceWorker.addEventListener(
        "controllerchange",
        onControllerChange,
      );

      // Existing worker already waiting (e.g. app reopened while an update
      // sat pending): activate it right away.
      if (reg.waiting && navigator.serviceWorker.controller) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
      }

      // New worker discovered during this visit: watch for install finish.
      reg.addEventListener("updatefound", () => {
        const worker = reg.installing;
        worker?.addEventListener("statechange", onStateChange);
      });
    };

    void register();
    return () => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
    };
  }, []);
  return null;
}
