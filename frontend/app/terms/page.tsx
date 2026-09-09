import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | WebDrop",
};

export default function TermsPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#0A0E1A] px-4 py-12">
      <div className="flex w-full max-w-3xl flex-col items-center rounded-xl border border-[#232B45] bg-[#12172A] p-8 sm:p-10">
        <h1 className="mb-2 text-center font-[family-name:var(--font-space-grotesk)] text-3xl font-bold tracking-tight text-[#E8ECF5] sm:text-4xl">
          Terms of Service
        </h1>
        <p className="mb-6 text-center text-sm text-[#8B93A7]">
          Last updated September 08, 2026
        </p>

        <div className="w-full max-w-prose space-y-6 text-left text-sm leading-relaxed text-[#8B93A7]">
          <h2 className="text-lg font-semibold text-[#E8ECF5]">
            Agreement to Our Terms
          </h2>
          <p>
            These Terms of Service (&quot;Terms&quot;) are a legally binding
            agreement between you and WebDrop (&quot;Company,&quot; &quot;we,&quot;
            &quot;us,&quot; &quot;our&quot;), based in Mumbai, Maharashtra, India,
            concerning your access to and use of
            https://webdrop-self.vercel.app (the &quot;Site&quot;) and the WebDrop
            service. By using WebDrop, you agree to these Terms. If you do not
            agree, please do not use the Service.
          </p>
          <p>
            Contact us: sanjaykumar4806135@gmail.com, or by mail at Netaji
            Subhash Chandra Bose Housing Society, near Shivaji Nagar, Mumbra,
            Thane, 400612, Mumbai, Maharashtra 400612, India.
          </p>

          <h2 className="text-lg font-semibold text-[#E8ECF5]">Our Service</h2>
          <p>
            WebDrop lets you transfer files, photos, videos, and text directly
            between two devices using a temporary 4-digit code or QR code.
            Transfers happen peer-to-peer; we do not store or have access to the
            content you send.
          </p>

          <h2 className="text-lg font-semibold text-[#E8ECF5]">
            User Responsibilities
          </h2>
          <p>
            You agree not to use WebDrop to transfer any content that is
            illegal, infringes on others&apos; rights, or violates applicable
            law. You are solely responsible for the content you choose to send
            using this Service. You represent that you have the legal right to
            use and share any content you transfer.
          </p>

          <h2 className="text-lg font-semibold text-[#E8ECF5]">
            Prohibited Activities
          </h2>
          <p>
            You agree not to: use the Service for any unlawful purpose; attempt
            to interfere with, disrupt, or overburden our infrastructure;
            attempt to bypass any security features; use automated tools/bots to
            abuse the Service; or use the Service to harass, harm, or transmit
            malicious software to others.
          </p>

          <h2 className="text-lg font-semibold text-[#E8ECF5]">
            Intellectual Property
          </h2>
          <p>
            The WebDrop name, design, and underlying code are owned by us. You
            retain full ownership of any files, photos, videos, or text you
            transfer using the Service — we claim no rights over your content,
            since it never passes through or is stored on our servers.
          </p>

          <h2 className="text-lg font-semibold text-[#E8ECF5]">
            Service Availability
          </h2>
          <p>
            We aim to keep WebDrop available and working reliably, but we do not
            guarantee uninterrupted access. We may modify, suspend, or
            discontinue the Service at any time without liability to you.
          </p>

          <h2 className="text-lg font-semibold text-[#E8ECF5]">Disclaimer</h2>
          <p>
            The Service is provided &quot;AS IS&quot; without warranties of any kind,
            express or implied. We do not guarantee that transfers will always
            succeed or be error-free, given the Service depends on your
            devices&apos; network conditions.
          </p>

          <h2 className="text-lg font-semibold text-[#E8ECF5]">
            Limitation of Liability
          </h2>
          <p>
            To the fullest extent permitted by law, WebDrop and its operators
            will not be liable for any indirect, incidental, or consequential
            damages arising from your use of the Service, including loss of data
            during a transfer.
          </p>

          <h2 className="text-lg font-semibold text-[#E8ECF5]">
            Governing Law
          </h2>
          <p>
            These Terms are governed by the laws of India. Any disputes will be
            subject to the exclusive jurisdiction of the courts in Mumbai,
            Maharashtra, India. Before pursuing formal legal action, both
            parties agree to first attempt to resolve any dispute informally by
            contacting the other party in writing, for at least 30 days.
          </p>

          <h2 className="text-lg font-semibold text-[#E8ECF5]">
            Changes to These Terms
          </h2>
          <p>
            We may update these Terms from time to time. Continued use of
            WebDrop after changes means you accept the revised Terms.
          </p>

          <h2 className="text-lg font-semibold text-[#E8ECF5]">Contact Us</h2>
          <p>
            WebDrop
            <br />
            Netaji Subhash Chandra Bose Housing Society, near Shivaji Nagar,
            Mumbra, Thane, 400612, Mumbai, Maharashtra 400612, India
            <br />
            Email: sanjaykumar4806135@gmail.com
            <br />
            Phone: 07304974080
          </p>
        </div>
      </div>
    </main>
  );
}