import type { Metadata } from "next";
import { WebDropTool } from "../components/WebDropTool";

export const metadata: Metadata = {
  title: "Send Text from Phone to PC Quickly | WebDrop",
  description:
    "Share a link, note, or any text from your phone to your computer instantly. Open WebDrop on both devices, pair with a QR code, and type or paste text that appears on the other screen.",
};

export default function SendTextPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#0A0E1A] px-4 py-10">
      <div className="flex w-full max-w-2xl flex-col items-center">
        <h1 className="mb-6 text-center font-[family-name:var(--font-space-grotesk)] text-3xl font-bold tracking-tight text-[#E8ECF5] sm:text-4xl">Send Text and Links from Phone to PC</h1>
        <p className="mx-auto mb-8 max-w-xl text-center text-base leading-relaxed text-[#8B93A7]">
          Need to get a link, a Wi-Fi password, or a block of text from your
          phone onto your computer&apos;s clipboard in a few seconds? Open WebDrop
          on both devices and pair them with the QR code or 4-digit code. Once
          connected, type or paste anything into the message box and hit send —
          it shows up instantly on the other screen, ready to copy. No accounts,
          no apps, no emailing yourself.
        </p>
        <WebDropTool />
      </div>
    </main>
  );
}
