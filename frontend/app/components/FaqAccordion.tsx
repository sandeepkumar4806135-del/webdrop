"use client";

import { useState } from "react";

type FaqItem = { question: string; answer: string };

/* FAQ content — accurate to how WebDrop actually works (P2P WebRTC,
   4-digit codes, no accounts, sender-only file flow, 30s self-destruct). */
const FAQ_ITEMS: FaqItem[] = [
  {
    question: "How does WebDrop actually work?",
    answer:
      "One device taps “Send” and gets a 4-digit code and QR code. The other device taps “Receive” and enters that code (or scans the QR). Once paired, the two devices connect directly to each other using a technology called WebRTC — your files, photos, videos, and messages travel straight from one device to the other, never through our servers.",
  },
  {
    question: "Is there a limit on file size — how many MB or GB can I send?",
    answer:
      "There's no hard file size limit. WebDrop has been tested successfully with files several hundred megabytes in size. Very large files (over roughly 2GB) may be less reliable depending on your device's available memory, since the receiving device briefly holds the incoming file in memory before saving it — but for typical photos, videos, and documents, size isn't something you need to worry about.",
  },
  {
    question: "Do both devices need to be on the same WiFi network?",
    answer:
      "No. WebDrop works even when your two devices are on completely different networks — for example, one on home WiFi and the other on mobile data. It automatically finds the best way to connect them directly.",
  },
  {
    question: "Is WebDrop secure and private?",
    answer:
      "Yes. Your files and messages travel directly between the two devices (peer-to-peer) using WebRTC's built-in encryption — they are never uploaded to or stored on our servers. Sessions also close automatically a short time after a transfer finishes, for extra privacy.",
  },
  {
    question: "Do I need to create an account or log in?",
    answer:
      "No. WebDrop has no accounts, no sign-up, and no login. Just open it and go.",
  },
  {
    question: "What devices and browsers does WebDrop work on?",
    answer:
      "Any modern device with a web browser — Windows, Mac, Linux, Android, iPhone, and iPad, using Chrome, Safari, Edge, or Firefox. Any combination works, e.g. sending from an iPhone to a Windows PC.",
  },
  {
    question: "What's the difference between using WebDrop in a browser versus the downloadable app?",
    answer:
      "They're exactly the same WebDrop, just presented differently. The downloadable app (installed directly from your browser, no app store needed) gives you a dedicated icon and a quicker way to open WebDrop, like a native app. The features, speed, and security are identical either way.",
  },
  {
    question: "Can I send multiple files at once?",
    answer:
      "Currently, WebDrop sends one file at a time. You can send another file right after the first one finishes, within the same connected session.",
  },
  {
    question: "Does the Camera button let me record video?",
    answer:
      "The Camera button opens your device's camera to take a live photo, which is then sent instantly. It's currently for photos only, not video recording.",
  },
  {
    question: "Do shared files disappear automatically?",
    answer:
      "For privacy, each completed file removes itself from the screen about 60 seconds after its own transfer finishes — sent files on the sender's screen and received downloads on the receiver's screen. Sessions stay open until both devices agree to close them with the Close Session button.",
  },
  {
    question: "I got a “Code not found” error — what happened?",
    answer:
      "Pairing codes are temporary and expire after a short time for security. If you waited too long to enter the code, or mistyped it, generate a fresh code on the sending device and try again.",
  },
  {
    question: "Is WebDrop free to use?",
    answer: "Yes, WebDrop is currently completely free to use.",
  },
];

/* Single-open accordion: clicking a question expands its answer and
   collapses any other open one; clicking the open question collapses it.
   The answer panel animates via grid-template-rows 0fr -> 1fr (smooth
   height without JS measurement), and the chevron rotates 180 degrees.
   reduced-motion users get the state change with no animation. */
export function FaqAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="mx-auto mt-10 flex w-full max-w-3xl flex-col gap-3 text-left">
      {FAQ_ITEMS.map((item, i) => {
        const open = openIndex === i;
        return (
          <div
            key={item.question}
            className={`overflow-hidden rounded-2xl border transition-colors ${
              open
                ? "border-[#3B5FE0]/40 bg-white"
                : "border-[#E6EAF2] bg-[#FAFBFC] hover:border-[#3B5FE0]/30"
            }`}
          >
            <button
              type="button"
              id={`faq-trigger-${i}`}
              onClick={() => setOpenIndex(open ? null : i)}
              aria-expanded={open}
              aria-controls={`faq-panel-${i}`}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#3B5FE0]"
            >
              <span className="font-[family-name:var(--font-space-grotesk)] text-base font-semibold text-[#1A1F2E]">
                {item.question}
              </span>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
                className={`shrink-0 text-[#3B5FE0] transition-transform duration-300 motion-reduce:transition-none ${
                  open ? "rotate-180" : ""
                }`}
              >
                <path
                  d="M6 9l6 6 6-6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {/* Grid-rows animation: 0fr collapses the panel, 1fr expands it. */}
            <div
              id={`faq-panel-${i}`}
              role="region"
              aria-labelledby={`faq-trigger-${i}`}
              className={`grid transition-[grid-template-rows] duration-300 ease-in-out motion-reduce:transition-none ${
                open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              }`}
            >
              <div className="overflow-hidden">
                <p className="px-5 pb-5 text-sm leading-relaxed text-[#5B6472]">
                  {item.answer}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}