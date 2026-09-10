"use client";

import { useState, type FormEvent } from "react";

/* Contact form posts via Formspree's AJAX endpoint so the page never
   reloads — we render inline sending/success/error states instead. */
const FORMSPREE_ENDPOINT = "https://formspree.io/f/xoeqyyoe";

const CONTACT_EMAIL = "sanjaykumar4806135@gmail.com";

const REASONS = [
  "General Question",
  "Bug Report / Something's Not Working",
  "Feature Request",
  "Business Inquiry",
  "Other",
];

const SUCCESS_HEADING = "Thanks! We'll get back to you soon.";

const ERROR_MESSAGE =
  "Something went wrong - please try again, or email us directly at ";

type FieldKey = "name" | "email" | "reason" | "message";

const EMPTY_FIELDS = { name: "", email: "", reason: "", message: "", gotcha: "" };

const INPUT_CLASSES =
  "w-full rounded-lg border border-[#E6EAF2] bg-[#FAFBFC] px-4 py-2.5 text-[#1A1F2E] outline-none placeholder:text-[#5B6472]/50 focus:border-[#3B5FE0] focus:ring-2 focus:ring-[#3B5FE0]/30";

export function ContactForm() {
  const [fields, setFields] = useState(EMPTY_FIELDS);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">(
    "idle"
  );

  const set =
    (key: keyof typeof EMPTY_FIELDS) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >
    ) => {
      setFields((f) => ({ ...f, [key]: e.target.value }));
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    };

  function validate(): Partial<Record<FieldKey, string>> {
    const v: Partial<Record<FieldKey, string>> = {};
    if (!fields.name.trim()) v.name = "Please enter your name.";
    if (!fields.email.trim()) {
      v.email = "Please enter your email address.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.trim())) {
      v.email = "Please enter a valid email address.";
    }
    if (!fields.reason) v.reason = "Please choose a reason.";
    if (!fields.message.trim()) v.message = "Please enter your message.";
    return v;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const v = validate();
    setErrors(v);
    if (Object.keys(v).length > 0) return;
    setStatus("sending");
    try {
      const res = await fetch(FORMSPREE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          name: fields.name.trim(),
          email: fields.email.trim(),
          reason: fields.reason,
          message: fields.message.trim(),
          _gotcha: fields.gotcha,
        }),
      });
      if (!res.ok) throw new Error(`Formspree responded ${res.status}`);
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  function resetForm() {
    setFields(EMPTY_FIELDS);
    setErrors({});
    setStatus("idle");
  }

  /* Success replaces the whole form; "Send another message" resets back. */
  if (status === "success") {
    return (
      <div className="mx-auto w-full max-w-[600px] rounded-2xl border border-[#E6EAF2] bg-white p-8 text-center sm:p-10">
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className="mx-auto text-[#34D399]"
        >
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
          <path
            d="M8 12.5l2.5 2.5L16 9.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <h3 className="mt-4 font-[family-name:var(--font-space-grotesk)] text-xl font-bold text-[#1A1F2E]">
          {SUCCESS_HEADING}
        </h3>
        <button
          type="button"
          onClick={resetForm}
          className="mt-4 font-semibold text-[#3B5FE0] underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B5FE0] focus-visible:ring-offset-2"
        >
          Send another message
        </button>
      </div>
    );
  }

  /* FORM JSX — renders Name / Email / Reason / Message plus honeypot,
     submit button with sending state, and the error banner on failure.
     Typed input is preserved because only the success branch swaps the
     UI — the error branch renders this same form with fields intact. */
  const sending = status === "sending";
  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="mx-auto flex w-full max-w-[600px] flex-col gap-5 rounded-2xl border border-[#E6EAF2] bg-white p-6 text-left sm:p-8"
    >
      {status === "error" && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-700"
        >
          {ERROR_MESSAGE}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          >
            {CONTACT_EMAIL}
          </a>
        </p>
      )}

      {/* Honeypot: offscreen text field, never display:none (bots skip
          those). Formspree discards submissions where it is filled in. */}
      <div className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
        <label htmlFor="contact-gotcha">Leave this field empty</label>
        <input
          id="contact-gotcha"
          type="text"
          name="_gotcha"
          value={fields.gotcha}
          onChange={set("gotcha")}
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <div>
        <label
          htmlFor="contact-name"
          className="mb-1.5 block text-sm font-semibold text-[#1A1F2E]"
        >
          Name
        </label>
        <input
          id="contact-name"
          type="text"
          name="name"
          autoComplete="name"
          placeholder="Your name"
          value={fields.name}
          onChange={set("name")}
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? "contact-name-error" : undefined}
          className={INPUT_CLASSES}
        />
        {errors.name && (
          <p id="contact-name-error" role="alert" className="mt-1.5 text-sm text-red-600">
            {errors.name}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="contact-email"
          className="mb-1.5 block text-sm font-semibold text-[#1A1F2E]"
        >
          Email
        </label>
        <input
          id="contact-email"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={fields.email}
          onChange={set("email")}
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? "contact-email-error" : undefined}
          className={INPUT_CLASSES}
        />
        {errors.email && (
          <p id="contact-email-error" role="alert" className="mt-1.5 text-sm text-red-600">
            {errors.email}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="contact-reason"
          className="mb-1.5 block text-sm font-semibold text-[#1A1F2E]"
        >
          Reason
        </label>
        <select
          id="contact-reason"
          name="reason"
          value={fields.reason}
          onChange={set("reason")}
          aria-invalid={!!errors.reason}
          aria-describedby={errors.reason ? "contact-reason-error" : undefined}
          className={`${INPUT_CLASSES} ${fields.reason ? "" : "text-[#5B6472]/70"}`}
        >
          <option value="" disabled>
            Select a reason
          </option>
          {REASONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        {errors.reason && (
          <p id="contact-reason-error" role="alert" className="mt-1.5 text-sm text-red-600">
            {errors.reason}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="contact-message"
          className="mb-1.5 block text-sm font-semibold text-[#1A1F2E]"
        >
          Message
        </label>
        <textarea
          id="contact-message"
          name="message"
          rows={5}
          placeholder="Tell us what's on your mind..."
          value={fields.message}
          onChange={set("message")}
          aria-invalid={!!errors.message}
          aria-describedby={errors.message ? "contact-message-error" : undefined}
          className={`${INPUT_CLASSES} resize-y`}
        />
        {errors.message && (
          <p id="contact-message-error" role="alert" className="mt-1.5 text-sm text-red-600">
            {errors.message}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={sending}
        className="rounded-lg bg-[#3B5FE0] py-3 font-semibold text-white transition-colors hover:bg-[#2F4DC4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B5FE0] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {sending ? "Sending..." : "Send Message"}
      </button>
    </form>
  );
}