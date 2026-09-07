import type { Metadata } from "next";
import { WebDropTool } from "../components/WebDropTool";

export const metadata: Metadata = {
  title: "Send Files from iPhone to Windows PC - No Cable, No App | WebDrop",
  description:
    "Send photos and files from your iPhone to a Windows PC instantly - no cable, no app install, no login. Just open WebDrop on both devices, scan the QR code or type the 4-digit code, and drag your files across.",
};

export default function IphoneToWindowsPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#0A0E1A] px-4 py-10">
      <div className="flex w-full max-w-2xl flex-col items-center">
        <h1 className="mb-6 text-center font-[family-name:var(--font-space-grotesk)] text-3xl font-bold tracking-tight text-[#E8ECF5] sm:text-4xl">Send Files from iPhone to Windows PC</h1>
        <p className="mx-auto mb-8 max-w-xl text-center text-base leading-relaxed text-[#8B93A7]">
          Need to get photos or files from your iPhone onto a Windows PC without
          plugging in a cable or installing anything? Open WebDrop in Safari on
          your iPhone and in Chrome or Edge on your PC. On one device tap{" "}
          <strong className="text-[#E8ECF5]">Send</strong>, then either scan the QR
          code with the other device or type the 4-digit code shown on screen.
          Once they&apos;re paired, just drag a file onto the drop zone - it goes
          directly between the two devices, no upload to a server, no login, no
          size limit.
        </p>
        <WebDropTool />
      </div>
    </main>
  );
}
