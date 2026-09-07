import type { Metadata } from "next";
import { WebDropTool } from "../components/WebDropTool";

export const metadata: Metadata = {
  title: "Share Files Using a QR Code in Your Browser | WebDrop",
  description:
    "Transfer files between devices by scanning a QR code - no app install needed. Open WebDrop on two devices, scan the code to pair, and send files directly through the browser.",
};

export default function QrCodePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#0A0E1A] px-4 py-10">
      <div className="flex w-full max-w-2xl flex-col items-center">
        <h1 className="mb-6 text-center font-[family-name:var(--font-space-grotesk)] text-3xl font-bold tracking-tight text-[#E8ECF5] sm:text-4xl">Share Files Using a QR Code</h1>
        <p className="mx-auto mb-8 max-w-xl text-center text-base leading-relaxed text-[#8B93A7]">
          WebDrop lets two devices pair for a file transfer just by scanning a QR
          code - no app to install, no account to create. Open it on both
          devices, tap <strong className="text-[#E8ECF5]">Send</strong> on one, and
          scan the QR code with the other (or type the 4-digit code if the camera
          isn&apos;t handy). The connection is direct and private: your files travel
          between the two browsers, not through a server.
        </p>
        <WebDropTool />
      </div>
    </main>
  );
}
