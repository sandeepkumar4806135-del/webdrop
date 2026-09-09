import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | WebDrop",
};

export default function PrivacyPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#0A0E1A] px-4 py-12">
      <div className="flex w-full max-w-3xl flex-col items-center rounded-xl border border-[#232B45] bg-[#12172A] p-8 sm:p-10">
        <h1 className="mb-2 text-center font-[family-name:var(--font-space-grotesk)] text-3xl font-bold tracking-tight text-[#E8ECF5] sm:text-4xl">
          Privacy Policy
        </h1>
        <p className="mb-6 text-center text-sm text-[#8B93A7]">
          Last updated September 08, 2026
        </p>

        <div className="w-full max-w-prose space-y-6 text-left text-sm leading-relaxed text-[#8B93A7]">
          <p>
            This Privacy Notice for WebDrop (&quot;we,&quot; &quot;us,&quot; or
            &quot;our&quot;) describes how and why we might access, collect,
            store, use, and/or share (&quot;process&quot;) your personal
            information when you use our services (&quot;Services&quot;),
            including when you visit our website at
            https://webdrop-self.vercel.app, use WebDrop (a free web-based tool
            that lets people instantly transfer files, photos, videos, and text
            between any two devices using a 4-digit code or QR code — transfers
            happen directly between devices peer-to-peer, and files are not
            uploaded to or stored on our servers), or otherwise engage with us.
          </p>
          <p>
            If you have questions or concerns, contact us at
            sanjaykumar4806135@gmail.com.
          </p>

          <h2 className="text-lg font-semibold text-[#E8ECF5]">
            What Information Do We Collect?
          </h2>
          <p>
            WebDrop does not require an account, login, or sign-up, so we do not
            directly collect names, emails, passwords, or similar personal
            information from you to use the core service. The 4-digit pairing
            code generated when you use WebDrop is temporary, expires
            automatically, and is not linked to your identity.
          </p>
          <p>
            Files, photos, videos, and text you choose to send through WebDrop
            travel directly between your device and the other device
            (peer-to-peer). They are not uploaded to, stored on, or accessible
            from our servers.
          </p>
          <p>
            We do not use Google Analytics, advertising trackers, or any
            third-party analytics or tracking cookies at this time. If this
            changes in the future, we will update this policy.
          </p>

          <h2 className="text-lg font-semibold text-[#E8ECF5]">
            How Do We Process Your Information?
          </h2>
          <p>
            We use limited technical infrastructure (Vercel for hosting, and
            Upstash for temporary connection pairing) to make two devices&apos;
            browsers find each other. This infrastructure briefly handles
            connection information (like the 4-digit code) needed to establish
            your direct device-to-device connection, and does not store your
            files or messages.
          </p>

          <h2 className="text-lg font-semibold text-[#E8ECF5]">
            International Data
          </h2>
          <p>
            Our hosting providers (Vercel and Upstash) may process data on
            servers located in the United States or other countries as part of
            their infrastructure. We take reasonable steps to keep any data
            handled by these providers secure.
          </p>

          <h2 className="text-lg font-semibold text-[#E8ECF5]">
            How Long Do We Keep Information?
          </h2>
          <p>
            Pairing codes expire automatically and are not retained after your
            session ends. We do not keep records of the files or messages you
            transfer, since they never pass through our servers.
          </p>

          <h2 className="text-lg font-semibold text-[#E8ECF5]">
            How Do We Keep Your Information Safe?
          </h2>
          <p>
            We use industry-standard practices (like WebRTC&apos;s built-in
            encryption for direct device-to-device connections) to help protect
            your data in transit. However, no method of transmission over the
            internet is 100% secure, and we cannot guarantee absolute security.
          </p>

          <h2 className="text-lg font-semibold text-[#E8ECF5]">
            Your Privacy Rights
          </h2>
          <p>
            Depending on where you live, you may have rights regarding any
            personal information relating to you. Since WebDrop collects minimal
            personal information by design, there is generally little to request
            access to or deletion of — but if you have questions about your
            data, contact us at sanjaykumar4806135@gmail.com.
          </p>

          <h2 className="text-lg font-semibold text-[#E8ECF5]">
            Do We Make Updates to This Notice?
          </h2>
          <p>
            We may update this Privacy Notice from time to time. The updated
            version will be indicated by a revised &quot;Last updated&quot; date.
          </p>

          <h2 className="text-lg font-semibold text-[#E8ECF5]">
            How Can You Contact Us?
          </h2>
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