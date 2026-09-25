import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Inter } from "next/font/google";
import { ServiceWorkerRegister } from "./components/ServiceWorkerRegister";
import { InstallPromptCapture } from "./components/InstallPromptCapture";
import { SiteFooter } from "./components/SiteFooter";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "WebDrop – Instant Cross-Platform File Transfer",
  description:
    "Transfer files and text instantly between any devices. No login, no cable, no shared WiFi needed. Open WebDrop on two devices and send files peer-to-peer.",
  manifest: "/manifest.webmanifest",
  // iOS "Add to Home Screen" support: standalone-capable, dark status bar to
  // match the navy theme, and the 192px icon as the home-screen icon.
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
  },
  icons: {
    apple: "/icon-192.png",
  },
  verification: {
    google: "jnUO2aX2H2A0NbNGzrwY0qcdjpivKaEtAVwwItwJfeA",
  },
};

// Browser UI chrome color (address bar / task switcher) in the navy theme.
// Separate `viewport` export: `themeColor` inside `metadata` was removed.
export const viewport: Viewport = {
  themeColor: "#0A0E1A",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#0A0E1A] font-[family-name:var(--font-inter)]">
        {/* Registers /sw.js client-side for PWA installability. */}
        <ServiceWorkerRegister />
        {/* Captures beforeinstallprompt at module-eval time (earliest point
            in the client bundle) so the Download section's install button
            never misses an event that fires before it mounts. */}
        <InstallPromptCapture />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
