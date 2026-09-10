import type { NextConfig } from "next";

// Defense-in-depth browser security headers, applied to every route.
//
// CSP notes (kept permissive only where this app genuinely needs it):
//   - script-src: Next.js App Router serves hydration + RSC bootstrap scripts
//     inline (no nonce infrastructure here), so 'unsafe-inline' is required or
//     the page won't hydrate. Kept alongside 'self' only.
//   - style-src: Tailwind's CSS is 'self', but the progress bars set widths via
//     inline style attributes, which need 'unsafe-inline'.
//   - img-src: the QR code is a `data:` URL from QRCode.toDataURL(), so we allow
//     data: images (self-hosted next/font fonts need no external font-src).
//   - connect-src: our /api/* polling fetches are 'self'; the Contact form
//     POSTs to Formspree (https://formspree.io), so that origin is allowed.
//     STUN/TURN/WebRTC are NOT subject to CSP connect-src (not fetch/XHR),
//     and Upstash is accessed server-side only, so nothing else is needed.
//   - frame-ancestors 'none' blocks clickjacking (plus X-Frame-Options: DENY
//     for older browsers).
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self' https://formspree.io",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
  // Prevents the site being embedded in a hidden iframe (clickjacking) on
  // HTTP/1.1-era browsers that ignore frame-ancestors.
  { key: "X-Frame-Options", value: "DENY" },
  // Stops browsers from MIME-sniffing/misinterpreting response file types.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Forces HTTPS at the browser level too (Vercel already serves HTTPS).
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // Privacy-conscious: send the full origin only on same-origin, and origin
  // when crossing origins over HTTPS.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Apply to every route.
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
