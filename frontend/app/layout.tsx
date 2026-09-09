import type { Metadata } from "next";
import { Space_Grotesk, Inter } from "next/font/google";
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
  verification: {
    google: "jnUO2aX2H2A0NbNGzrwY0qcdjpivKaEtAVwwItwJfeA",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#0A0E1A] font-[family-name:var(--font-inter)]">
        {children}
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
      </body>
    </html>
  );
}
