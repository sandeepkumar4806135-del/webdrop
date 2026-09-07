import type { Metadata } from "next";
import { WebDropTool } from "../components/WebDropTool";

export const metadata: Metadata = {
  title: "Transfer Files from Android to Mac Wirelessly | WebDrop",
  description:
    "Send files from your Android phone to a Mac without cables, email, or cloud uploads. Open WebDrop on both devices, pair them with a QR code or 4-digit code, and transfer photos, documents, and more.",
};

export default function AndroidToMacPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#0A0E1A] px-4 py-10">
      <div className="flex w-full max-w-2xl flex-col items-center">
        <h1 className="mb-6 text-center font-[family-name:var(--font-space-grotesk)] text-3xl font-bold tracking-tight text-[#E8ECF5] sm:text-4xl">Transfer Files from Android to Mac</h1>
        <p className="mx-auto mb-8 max-w-xl text-center text-base leading-relaxed text-[#8B93A7]">
          Moving photos or documents from an Android phone to a Mac doesn&apos;t
          require a USB cable, an email to yourself, or a cloud upload. Open
          WebDrop in Chrome on your Android device and in Safari or Chrome on
          your Mac. Tap <strong className="text-[#E8ECF5]">Send</strong> on one,
          scan the QR code or type the 4-digit code on the other, and drag a file
          onto the drop zone. It goes device-to-device, privately, with no login
          and no file-size cap.
        </p>
        <WebDropTool />
      </div>
    </main>
  );
}
