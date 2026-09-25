"use client";

import { useSyncExternalStore } from "react";

/**
 * Layout-level capture of the PWA install prompt event.
 *
 * WHY THIS EXISTS: `beforeinstallprompt` fires when Chrome/Edge's
 * installability evaluation completes — on a FIRST-ever cold visit that can
 * happen while the page is still downloading JS / hydrating, BEFORE the
 * landing page's Download section (and its InstallButton cards) exist. An
 * event with no listener is lost for that navigation, so the buttons would
 * show the "Open WebDrop..." fallback even though the browser fully supports
 * installation. A captured event was additionally discarded whenever the
 * platform-detection swap unmounted the fallback grid and mounted fresh
 * single-card instances.
 *
 * This module attaches its listeners at MODULE EVALUATION time (not inside
 * a component effect), i.e. the moment the root layout's client chunk
 * executes during initial page load — the earliest reliable point short of
 * an inline script. The captured event lives in a module-level store, so
 * component mounts/unmounts/re-renders can never lose it, and it stays
 * available no matter when the user later reaches the Download section.
 *
 * Mounted once in app/layout.tsx (InstallPromptCapture); consumers read it
 * reactively via useInstallPrompt().
 */

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferredEvent: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

const notify = () => {
  for (const listener of listeners) listener();
};

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // suppress the browser's own mini-infobar
    deferredEvent = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    // Deliberately NOT used to claim "Already Installed" anywhere (Chrome
    // on Android has a documented history of firing `appinstalled`
    // spuriously) — its only reliable use is dropping the one-shot prompt
    // event so no card offers a dead prompt.
    deferredEvent = null;
    notify();
  });
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

const getSnapshot = () => deferredEvent;
const getServerSnapshot = () => null;

/** One-shot: the underlying beforeinstallprompt event is consumed here. */
export function consumeInstallPrompt(): void {
  deferredEvent = null;
  notify();
}

/** Reactive read of the currently captured install prompt event (if any). */
export function useInstallPrompt(): {
  deferred: BeforeInstallPromptEvent | null;
  consume: () => void;
} {
  const deferred = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  return { deferred, consume: consumeInstallPrompt };
}

/**
 * Renders nothing. Mounted in the root layout so this module's listeners
 * are attached from the moment the layout bundle evaluates, on every page.
 */
export function InstallPromptCapture() {
  return null;
}
